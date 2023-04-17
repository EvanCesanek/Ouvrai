import datetime
import os, json, re, warnings, random
import numpy as np
import pandas as pd


def test():
    print("Hello from Ouvrai!")


def load(
    data_folder: str = "./",
    file_regex: str = "^data_",
    from_pkl: bool = False,
    pickle: bool = False,
    save_format: str = "pkl",
    save_name: str = "df",
):
    """
    Wrangle Firebase JSON data into data frames.

    Parameters
    ----------
    data_folder : str, optional
         Relative path to data, by default "./"
    file_regex : str, optional
        Regular expression uniquely identifying data files to load, by default "^data_"
    from_pkl : bool, optional
        Load data frames from .pkl files (if they exist), by default False
    pickle : bool, optional
        Save data frames to .pkl files, by default False
    save_format : str, optional
        Save data frames to other file types (if `pickle = False`), by default "pkl"
    save_name : str, optional
        Specify file name of the output data file (prefix if save_format = "pkl" or "csv")

    Returns
    -------
    tuple
        A tuple containing:

        df_trial
            Data frame where each row is a trial.
        df_subject
            Data frame where each row is a subject.
        df_frame
            Data frame where each row is a single render loop.
        df_state
            Data frame where each row is a state transition in the experiment finite-state machine.
    """

    # Strip any leading/trailing quotes added when running from command line (see ouvrai-wrangle.js)
    data_folder = data_folder.lstrip("'").rstrip("'")

    if from_pkl:
        try:
            df_trial = pd.read_pickle(data_folder + "df_trial.pkl")
            df_subject = pd.read_pickle(data_folder + "df_subject.pkl")
            df_frame = pd.read_pickle(data_folder + "df_frame.pkl")
            df_state = pd.read_pickle(data_folder + "df_state.pkl")
        except:
            warnings.warn(
                "Failed to load .pkl files. Did you mean to set from_pkl = False?"
            )
            return
    else:
        # Collect data
        dir_contents = os.listdir(data_folder)  # contents of the data folder
        D = {}  # initalize dictionary D to store all the data
        for filename in [fn for fn in dir_contents if re.search(file_regex, fn)]:
            print(f"Reading {filename}")
            with open(data_folder + filename) as open_file:  # prefix with data_folder
                d = json.load(open_file)  # read into a small dictionary d
                if not all([len(l) == 28 for l in d.keys()]):
                    warnings.warn(
                        "Keys do not look like Firebase UIDs! Check your files."
                    )
                D = {**D, **d}  # concatenate dictionaries

        # Arrange it in a data frame
        df_trial = pd.DataFrame()
        df_subject = pd.DataFrame()
        for si, (s, d) in enumerate(D.items()):  # loop over subjects
            info = pd.json_normalize(d.pop("info"))  # separate out the 'info'
            data = pd.DataFrame.from_dict(
                d, orient="index"
            )  # read dictionary as data frame
            data["subject"] = "{:0>3}".format(si)
            data["uid"] = s
            info["subject"] = "{:0>3}".format(si)
            info["uid"] = s
            df_trial = pd.concat([df_trial, data], ignore_index=True)
            df_subject = pd.concat([df_subject, info], ignore_index=True)

        # Separate list-type columns containing frame data or state-change data
        reftrial = df_trial.iloc[0]
        reftrial = reftrial[reftrial.apply(isinstance, args=(list,))]
        # Per-frame columns should be the same length as "t"
        numframes_reftrial = len(reftrial["t"])
        frame_columns = [
            c for c in reftrial.index if len(reftrial[c]) == numframes_reftrial
        ]
        print(f"Frame variables are: {frame_columns}")
        # Per-statechange columns should be the same length as "stateChange"
        numstatechanges_reftrial = len(reftrial["stateChange"])
        statechange_columns = [
            c for c in reftrial.index if len(reftrial[c]) == numstatechanges_reftrial
        ]
        print(f"State change variables are: {statechange_columns}")
        # Pop these columns from df_trial and reassemble them in their own DataFrames
        df_frame = pd.concat([df_trial.pop(c) for c in frame_columns], axis=1)
        df_state = pd.concat([df_trial.pop(c) for c in statechange_columns], axis=1)

        # Add information that is missing from the new DataFrames
        df_frame["subject"] = df_trial["subject"]
        df_frame["trialNumber"] = df_trial["trialNumber"]
        df_frame["cycle"] = df_trial["cycle"]
        df_state["subject"] = df_trial["subject"]
        df_state["trialNumber"] = df_trial["trialNumber"]

        # Explode new DataFrames with per-trial lists into long format
        df_frame = df_frame.explode(frame_columns, True)
        df_state = df_state.explode(statechange_columns, True)

        # Expand any object columns (typically x,y,z)
        df_trial = expand_object_columns(df_trial)
        df_subject = expand_object_columns(df_subject)
        df_frame = expand_object_columns(df_frame)
        df_state = expand_object_columns(df_state)

        # [DEPRECATED] Transform "stateNames" into a dictionary mapping from integer codes to names
        # df_subject["stateNames"] = df_subject["stateNames"].transform(
        #     lambda x: {id: name for id, name in enumerate(x)}
        # )
        # df_frame["state"] = rename_states(df_frame, df_subject)
        # df_state["state"] = rename_states(df_state, df_subject, state_col="stateChange")

        # Sometimes t is dtype 'object' due to mix of ints and floats
        df_frame["t"] = df_frame["t"].astype(float)

        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        if pickle or save_format in {"pkl", ".pkl", "pickle"}:
            df_trial.to_pickle(data_folder + save_name + "_trial_" + ts + ".pkl")
            df_subject.to_pickle(data_folder + save_name + "_subject_" + ts + ".pkl")
            df_frame.to_pickle(data_folder + save_name + "_frame_" + ts + ".pkl")
            df_state.to_pickle(data_folder + save_name + "_state_" + ts + ".pkl")
        elif save_format in {"csv", "txt", ".csv", ".txt"}:
            df_trial.to_csv(data_folder + save_name + "_trial_" + ts + ".csv")
            df_subject.to_csv(data_folder + save_name + "_subject_" + ts + ".csv")
            df_frame.to_csv(data_folder + save_name + "_frame_" + ts + ".csv")
            df_state.to_csv(data_folder + save_name + "_state_" + ts + ".csv")
        elif save_format in {"xls", "xlsx", ".xls", ".xlsx", "excel"}:
            with pd.ExcelWriter(data_folder + save_name + "_" + ts + ".xlsx") as writer:
                df_trial.to_excel(writer, "trial")
                df_subject.to_excel(writer, "subject")
                df_frame.to_excel(writer, "frame")
                df_state.to_excel(writer, "state")

        df_frame.reset_index(drop=True, inplace=True)

    return df_trial, df_subject, df_frame, df_state


def expand_object_columns(df):
    """
    Horizontally expand columns that contain Python dictionaries (with multiple values) into separate columns with single values.

    Parameters
    ----------
    df : DataFrame
        Unexpanded data frame
    
    Returns
    -------
    df : DataFrame
        Horizontally expanded data frame
    """
    object_columns = df.columns[df.iloc[0].apply(isinstance, args=(dict,))].values
    for col_name in object_columns:
        child_names = df[col_name].to_list()
        expanded = pd.DataFrame(child_names, df.index).add_prefix(f"{col_name}_")
        # Three.js orientation dimensions already have underscores
        # Don't allow repeated underscores
        expanded = expanded.rename(columns=lambda x: re.sub("_+", "_", x))
        df = pd.concat([df, expanded], axis=1)
        df = df.drop(col_name, axis=1)
        print(f"Expanded {col_name} to {expanded.columns.values}")
    return df


def rename_states(df: pd.DataFrame, df_subject: pd.DataFrame, state_col: str = "state"):
    """
    [DEPRECATED] Transform integer-coded state values into categorical strings.

    Parameters
    ----------
    df : pd.DataFrame
        A data frame containing a 'subject' column and a column of integer-coded states.
    df_subject : pd.DataFrame
        A subject-level data frame containing a vector of state names.
        Integer codes correspond to indexes of this vector.
    state_col : str, optional
        Name of the column of integer-coded states in `df`, by default "state"

    Returns
    -------
    pd.Series
        A column of categorical state names,.
    """

    g = df.groupby("subject")[state_col]
    return g.transform(
        lambda x: x.replace(
            df_subject.loc[df_subject["subject"] == x.name, "stateNames"].values[0]
        ).astype(pd.CategoricalDtype(ordered=True))
    )


def load_demographics(df_subject: pd.DataFrame, path="demographics.csv"):
    """
    Merge demographic data into the subject-level data frame.

    Parameters
    ----------
    df_subject : pd.DataFrame
        Subject-level data frame.
    path : str, optional
        Path to the demographics file you wish to load, by default "demographics.csv"

    Returns
    -------
    pd.DataFrame
        Subject-level data frame with added columns of demographic info.
    """
    try:
        df_subject = df_subject.merge(
            pd.read_csv(path)
            .query('Status == "APPROVED" & `Completion code` != "Manual Completion"')
            .rename({"Participant id": "workerId"}, axis=1)[
                [
                    "workerId",
                    "Time taken",
                    "Total approvals",
                    "Total rejections",
                    "Approval rate",
                    "Age",
                    "Sex",
                    "Ethnicity simplified",
                    "Country of birth",
                    "Country of residence",
                    "Nationality",
                    "Student status",
                    "Employment status",
                ]
            ],
            how="left",
            on="workerId",
        )
    except (FileNotFoundError):
        warnings.warn(
            "Demographics file not found. Download it from Prolific or Amazon Mechanical Turk with 'ouvrai download <studyname> --demographics'."
        )
    finally:
        return df_subject


def compute_kinematics(
    df_subject: pd.DataFrame,
    df_frame: pd.DataFrame,
    pos_prefix="rhPos",
    ori_prefix="rhOri",
):
    """
    Compute helpful kinematic quantities from raw position data, including including deltas, distance from landmarks, cumulative distance, velocity (m/s), time since trial start, and direction of +Z axis (from quaternion).

    Parameters
    ----------
    df_subject : pd.DataFrame
        Subject-level data frame containing columns 'homePosn.x', 'homePosn.y', and 'homePosn.z'
    df_frame : pd.DataFrame
        Frame-level data frame
    pos_prefix : str, optional
        Name of the raw position variable (Vector3) you wish to compute kinematics from, by default "rhPos"
    ori_prefix : str, optional
        Name of the raw orientation variable (Quaternion or Euler) you wish to compute kinematics from, by default "rhOri"

    Returns
    -------
    pd.DataFrame
        Input df_frame with kinematic quantities added in additional columns

    Raises
    ------
    RuntimeError
        
    """
    cols_to_diff = ["t", f"{pos_prefix}_x", f"{pos_prefix}_y", f"{pos_prefix}_z"]
    g = df_frame.groupby(["subject", "trialNumber"])
    df_frame[["dt", "dx", "dy", "dz"]] = g[cols_to_diff].diff()
    df_frame["dpos"] = np.linalg.norm(df_frame[["dx", "dy", "dz"]], axis=1)

    # eliminate any frames with no movement
    df_frame = df_frame[
        df_frame["dpos"] != 0
    ].copy()  # copy to avoid chained indexing warning

    # REPEAT diff after frame elimination
    g = df_frame.groupby(["subject", "trialNumber"])
    df_frame[["dt", "dx", "dy", "dz"]] = g[cols_to_diff].diff()
    df_frame["dpos"] = np.linalg.norm(df_frame[["dx", "dy", "dz"]], axis=1)
    df_frame["dpos_xz"] = np.linalg.norm(df_frame[["dx", "dz"]], axis=1)
    df_frame["cum_distance"] = df_frame.groupby(["subject", "trialNumber"])[
        "dpos"
    ].cumsum()
    df_frame["cum_distance_xz"] = df_frame.groupby(["subject", "trialNumber"])[
        "dpos_xz"
    ].cumsum()
    df_frame["velocity"] = df_frame["dpos"] / (df_frame["dt"] / 1000)

    # Subtract start time from all trials
    df_frame = df_frame.join(
        df_frame.groupby(["subject", "trialNumber"])["t"].min().rename("t_start"),
        how="left",
        on=["subject", "trialNumber"],
    )
    df_frame["t_abs"] = df_frame["t"]
    df_frame["t"] = df_frame["t"] - df_frame["t_start"]

    def distance_from_start(df_frame_subject: pd.DataFrame, dims=[0, 1, 2]):
        """
        Instantaneous distance from the start along any dimension (or combination of dimensions).\n
        Assumes that df_subject exists with columns 'homePosn.x', 'homePosn.y', and 'homePosn.z'.\n
        Typical usage: `df_frame.groupby("subject", group_keys=False).apply(distance_from_start,dims=[...])`

        Parameters
        ----------
        df_frame_subject : pd.DataFrame
            Frame-level data for a single subject.
        dims : list, optional
            Array of dimensions along which to compute distance, by default [0, 1, 2] (i.e., 3D Euclidean distance)

        Returns
        -------
        DataFrame
            Data frame with a single column containing distance values.

        Raises
        ------
        RuntimeError
            
        """

        sb = df_frame_subject.name
        if sb not in df_subject["subject"].unique():
            raise RuntimeError(
                f"Subject '{sb}' not found. Apply this function to each subject via groupby('subject')."
            )
        xyz = df_frame_subject[
            [f"{pos_prefix}_x", f"{pos_prefix}_y", f"{pos_prefix}_z"]
        ]
        home_xyz = df_subject.loc[
            df_subject["subject"] == sb, ["homePosn.x", "homePosn.y", "homePosn.z"]
        ].values.astype(float)
        xyz = xyz.iloc[:, dims]
        home_xyz = home_xyz[:, dims]
        # groupby.apply functions must return DataFrame with same index to preserve shape
        out = pd.DataFrame(
            np.linalg.norm(xyz - home_xyz, axis=1), index=df_frame_subject.index
        )
        return out

    df_frame["distance"] = df_frame.groupby("subject", group_keys=False).apply(
        distance_from_start, dims=[0, 2]
    )

    df_frame = df_frame.join(euler_to_direction(data=df_frame, prefix=ori_prefix))

    return df_frame


def find_first_velocity_peak(
    df_trial, df_subject, df_frame, dist_range=[0.1, 0.75], pv_thresh=0.05,
):
    if "targetDistance" not in df_subject.columns:
        warnings.warn(
            f"'targetDistance' not found in df_subject... Using maximum distance on each trial instead."
        )
    # Peak velocity
    def helper(x):
        sb = x.name[0]  # x["subject"].values[0]
        tn = x.name[1]  # x["trialNumber"].values[0]

        # This may not work for all experiments!
        # try:
        target_distance = df_subject.query("subject == @sb")["targetDistance"].values[0]
        # except KeyError as e:
        #     print(e)
        #     target_distance = x["distance"].max()

        # Apply peak detection while distance to home is within 10% - 75% (default) of target distance
        vel_lwr = dist_range[0] * target_distance
        vel_upr = dist_range[1] * target_distance

        above_vel_lwr = x["distance"] >= vel_lwr
        # if not any(above_vel_lwr):
        #     warnings.warn(
        #         f"\n\t{x.name}: distance never exceeded lower threshold {vel_lwr:.3f}...\n\tThat's a problem! Examine this trial."
        #     )
        #     g = sns.lineplot(data=x, x="rhPos_x", y="rhPos_z", sort=False)
        #     g.set_aspect("equal")

        above_vel_upr = x["distance"] >= vel_upr
        if not any(above_vel_upr):
            # warnings.warn(
            #     f"\n\t{x.name}: distance never exceeded upper threshold {vel_upr:.3f}.\n\tFalling back to 90% of maximum distance = {0.9 * x['distance'].max():.3f}"
            # )
            vel_upr = 0.9 * x["distance"].max()  # dist_range[1] * x["distance"].max()
            above_vel_upr = x["distance"] >= vel_upr

        start_idx = np.argmax(above_vel_lwr)
        end_idx = np.argmax(above_vel_upr)
        cropped = x.iloc[start_idx:end_idx]

        try:
            first_peak_idx = np.argmax(cropped["velocity"])
        except:
            print(
                f"{x.name}: cropped was empty... {vel_lwr, vel_upr, start_idx, end_idx}"
            )
            # g = sns.lineplot(data=x, x="rhPos_x", y="rhPos_z", sort=False)
            # g.set_aspect("equal")

        # get the index of the original data frame
        pv_idx = cropped.iloc[first_peak_idx].name  # .name because it's a Series

        pv = x.loc[pv_idx, "velocity"]
        tpv = x.loc[pv_idx, "t"]
        before_pv = x.loc[:pv_idx]
        mask = before_pv["velocity"] <= pv_thresh * pv
        if not any(mask):
            warnings.warn(
                f"Pre-peak velocity never below pv_thresh ({pv_thresh*pv:.2} m/s) for {x.name}"
            )
            t_onset_pv = before_pv["t"].values[0]
        else:
            t_onset_pv = before_pv.loc[mask, "t"].values[-1]

        # Side effects on df_trial
        sel = (df_trial["subject"] == sb) & (df_trial["trialNumber"] == tn)
        df_trial.loc[sel, "pv"] = pv
        df_trial.loc[sel, "t_pv"] = tpv
        df_trial.loc[sel, "t_onset_pv"] = t_onset_pv

        return

    # Compute movement onset time based on peak velocity threshold
    df_frame.groupby(["subject", "trialNumber"]).apply(helper)

    # Subtract onset time from all trials
    df_frame = df_frame.merge(
        df_trial[["subject", "trialNumber", "t_onset_pv"]],
        how="left",
        on=["subject", "trialNumber"],
    )
    df_frame["t_onset"] = df_frame["t"] - df_frame["t_onset_pv"]

    # Identify onset frame
    df_frame["onset_pv"] = df_frame["t_onset_pv"] == df_frame["t"]

    return df_trial, df_frame


def get_nearest_row(df: pd.DataFrame, varname: str, value: float):
    """
    Find row with least difference from specified value of specified column.

    Parameters
    ----------
    df : pd.DataFrame
    varname : str
        A column of `df`
    value : float
        The value of `varname` that you want to retrieve the nearest row

    Returns
    -------
    pd.DataFrame
        One row of `df`
    """
    return df.iloc[np.nanargmin(np.abs(df[varname] - value))]


def euler_to_direction(
    euler=None, data=None, prefix=None, dir={"x": 0, "y": 0, "z": -1}
):
    """Transforms a direction (default -Z axis) according to an Euler (XYZ order) or a Quaternion representation of orientation."""
    if euler != None and euler["_isEuler"]:
        # default naming from three.js Object3D.rotation
        x = euler["_x"]
        y = euler["_y"]
        z = euler["_z"]
    elif isinstance(data, pd.DataFrame):
        isEuler = data.get(f"{prefix}_isEuler", pd.Series([False]))
        isQuaternion = data.get(f"{prefix}_isQuaternion", pd.Series([False]))
        # print(isQuaternion)
        if isEuler.all():
            x = data[f"{prefix}_x"]
            y = data[f"{prefix}_y"]
            z = data[f"{prefix}_z"]
            # (Quaternion/setFromEuler)
            c1 = np.cos(x / 2)
            c2 = np.cos(y / 2)
            c3 = np.cos(z / 2)
            s1 = np.sin(x / 2)
            s2 = np.sin(y / 2)
            s3 = np.sin(z / 2)
            qx = s1 * c2 * c3 + c1 * s2 * s3
            qy = c1 * s2 * c3 - s1 * c2 * s3
            qz = c1 * c2 * s3 + s1 * s2 * c3
            qw = c1 * c2 * c3 - s1 * s2 * s3
        elif isQuaternion.all():
            qw = data[f"{prefix}_w"]
            qx = data[f"{prefix}_x"]
            qy = data[f"{prefix}_y"]
            qz = data[f"{prefix}_z"]

    # (Vector3/applyQuaternion)
    ix = qw * dir["x"] + qy * dir["z"] - qz * dir["y"]
    iy = qw * dir["y"] + qz * dir["x"] - qx * dir["z"]
    iz = qw * dir["z"] + qx * dir["y"] - qy * dir["x"]
    iw = -qx * dir["x"] - qy * dir["y"] - qz * dir["z"]
    out = {
        "x": ix * qw + iw * -qx + iy * -qz - iz * -qy,
        "y": iy * qw + iw * -qy + iz * -qx - ix * -qz,
        "z": iz * qw + iw * -qz + ix * -qy - iy * -qx,
    }

    if isinstance(data, pd.DataFrame):
        out = pd.DataFrame(out)
        out = out.rename({"x": "dir_x", "y": "dir_y", "z": "dir_z"}, axis=1)

    return out


def get_trial(df: pd.DataFrame, sb: str = None, tn: str = None):
    """
    Retrieve data for a single trial from a data frame.

    Parameters
    ----------
    df : pd.DataFrame
        Data frame containing 'subject' and 'trialNumber' columns.
    sb : str, optional
        A subject name, by default None chooses a random subject
    tn : str, optional
        A trial number, by default None chooses a random trial

    Returns
    -------
    _type_
        _description_
    """
    if sb is None:
        sb = random.choice(df["subject"].unique())
    df = df.loc[df["subject"] == sb]
    if tn is None:
        tn = random.choice(df["trialNumber"].unique())
    df = df.loc[df["trialNumber"] == tn]
    return df


def MAD(x: list[float]):
    """
    Scaled median absolute deviation (cf. Leys et al 2013)

    Parameters
    ----------
    x : list[float]
        Numeric values on which to compute MAD

    Returns
    -------
    float
        Scaled median absolute deviation
    """
    return 1.4826 * np.median(np.abs(x - np.median(x)))


def isoutlier(x: list[float], crit=3):
    """
    Outlier detection via MAD threshold (cf. Leys et al 2013)

    Parameters
    ----------
    x : list[float]
        Numeric values on which to run outlier detection
    crit : int, optional
        Criterion threshold, by default 3

    Returns
    -------
    list[bool]
        Boolean array where true indicates outliers.
    """
    return np.abs(x - np.median(x)) > crit * MAD(x)
