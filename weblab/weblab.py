import os, json, re, warnings, random
import numpy as np
import pandas as pd
import statsmodels as sm
import seaborn as sns
from scipy.signal import find_peaks_cwt
from scipy.optimize import curve_fit
from statsmodels.tools import add_constant
from IPython.display import display


def test():
    print("Hello from weblab!")


def load(data_folder="../", file_regex="^data_", from_pkl=False, pickle=False):
    """Load Firebase .json data into data frames.

    Parameters
    ----------
    data_folder : string
        Relative path to data.
    file_regex : string
        Regular expression uniquely identifying data files to load.
    from_pkl : bool
        Load data frames from .pkl files (if they exist)
    pickle : bool
        Save data frames to .pkl files

    Returns
    -------
    df
        Data frame where each row is a trial.
    df_sub
        Data frame where each row is a subject.
    df_frame
        Data frame where each row is a single render loop or movement event.
    df_state
        Data frame where each row is a state transition in the experiment finite-state machine.
    """
    try:
        if not from_pkl:
            raise Exception
        df = pd.read_pickle(data_folder + "df.pkl")
        df_sub = pd.read_pickle(data_folder + "df_sub.pkl")
        df_frame = pd.read_pickle(data_folder + "df_frame.pkl")
        df_state = pd.read_pickle(data_folder + "df_state.pkl")
    except:
        if from_pkl:
            warnings.warn("Failed to load .pkl file. Loading from .json")

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
        df = pd.DataFrame()
        df_sub = pd.DataFrame()
        for si, (s, d) in enumerate(D.items()):  # loop over subjects
            info = pd.json_normalize(d.pop("info"))  # separate out the 'info'
            data = pd.DataFrame.from_dict(
                d, orient="index"
            )  # read dictionary as data frame
            data["subject"] = "{:0>3}".format(si)
            data["uid"] = s
            info["subject"] = "{:0>3}".format(si)
            info["uid"] = s
            df = pd.concat([df, data], ignore_index=True)
            df_sub = pd.concat([df_sub, info], ignore_index=True)

        # Separate list-type columns containing frame data or state-change data
        reftrial = df.iloc[0]
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
        # Pop these columns from df and reassemble them in their own DataFrames
        df_frame = pd.concat([df.pop(c) for c in frame_columns], axis=1)
        df_state = pd.concat([df.pop(c) for c in statechange_columns], axis=1)

        # Add information that is missing from the new DataFrames
        df_frame["subject"] = df["subject"]
        df_frame["trialNumber"] = df["trialNumber"]
        df_frame["cycle"] = df["cycle"]
        df_frame["targetId"] = df["targetId"]
        df_state["subject"] = df["subject"]
        df_state["trialNumber"] = df["trialNumber"]

        # Explode new DataFrames with per-trial lists into long format
        df_frame = df_frame.explode(frame_columns, True)
        df_state = df_state.explode(statechange_columns, True)

        # Expand any object columns (typically x,y,z)
        df = expand_object_columns(df)
        df_sub = expand_object_columns(df_sub)
        df_frame = expand_object_columns(df_frame)
        df_state = expand_object_columns(df_state)

        # Transform "stateNames" into a dictionary mapping from integer codes to names
        df_sub["stateNames"] = df_sub["stateNames"].transform(
            lambda x: {id: name for id, name in enumerate(x)}
        )
        df_frame["state"] = rename_states(df_frame, df_sub)
        df_state["state"] = rename_states(df_state, df_sub, state_col="stateChange")

        # Sometimes t is dtype 'object' due to mix of ints and floats
        df_frame["t"] = df_frame["t"].astype(float)

        if pickle:
            df.to_pickle(data_folder + "df.pkl")
            df_sub.to_pickle(data_folder + "df_sub.pkl")
            df_frame.to_pickle(data_folder + "df_frame.pkl")
            df_state.to_pickle(data_folder + "df_state.pkl")

        df_frame.reset_index(drop=True, inplace=True)

    return df, df_sub, df_frame, df_state


def expand_object_columns(df):
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


def rename_states(df, df_sub, state_col="state"):
    g = df.groupby("subject")[state_col]
    return g.transform(
        lambda x: x.replace(
            df_sub.loc[df_sub["subject"] == x.name, "stateNames"].values[0]
        ).astype(pd.CategoricalDtype(ordered=True))
    )


def load_demographics(df_sub, path="demographics.csv"):
    """Merge in demographic data from Prolific."""
    try:
        df_sub = df_sub.merge(
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
        display(pd.DataFrame(df_sub["Sex"].describe()))
        display(pd.DataFrame(df_sub.Age.astype("float").describe()))
    except (FileNotFoundError):
        warnings.warn("Demographics file not found. You can download it from Prolific.")
    finally:
        return df_sub


def compute_kinematics(
    df_sub,
    dfx,
    pos_prefix="rhPos",
):
    cols_to_diff = ["t", f"{pos_prefix}_x", f"{pos_prefix}_y", f"{pos_prefix}_z"]
    g = dfx.groupby(["subject", "trialNumber"])
    dfx[["dt", "dx", "dy", "dz"]] = g[cols_to_diff].diff()
    dfx["dpos"] = np.linalg.norm(dfx[["dx", "dy", "dz"]], axis=1)

    # eliminate any frames with no movement
    dfx = dfx[dfx["dpos"] != 0].copy()  # copy to avoid chained indexing warning

    # REPEAT diff after frame elimination
    g = dfx.groupby(["subject", "trialNumber"])
    dfx[["dt", "dx", "dy", "dz"]] = g[cols_to_diff].diff()
    dfx["dpos"] = np.linalg.norm(dfx[["dx", "dy", "dz"]], axis=1)
    dfx["dpos_xz"] = np.linalg.norm(dfx[["dx", "dz"]], axis=1)
    dfx["cum_distance"] = dfx.groupby(["subject", "trialNumber"])["dpos"].cumsum()
    dfx["cum_distance_xz"] = dfx.groupby(["subject", "trialNumber"])["dpos_xz"].cumsum()
    dfx["velocity"] = dfx["dpos"] / (dfx["dt"] / 1000)

    # Subtract start time from all trials
    dfx = dfx.join(
        dfx.groupby(["subject", "trialNumber"])["t"].min().rename("t_start"),
        how="left",
        on=["subject", "trialNumber"],
    )
    dfx["t_abs"] = dfx["t"]
    dfx["t"] = dfx["t"] - dfx["t_start"]

    # Instantaneous distance from the start (along any dim or combination of dims)
    def distance_from_start(x, dims=[0, 1, 2]):
        sb = x.name
        if sb not in df_sub["subject"].unique():
            raise RuntimeError(
                f"Subject '{sb}' not found. Apply this function to each subject via groupby('subject')."
            )
        xyz = x[[f"{pos_prefix}_x", f"{pos_prefix}_y", f"{pos_prefix}_z"]]
        home_xyz = df_sub.loc[
            df_sub["subject"] == sb, ["homePosn.x", "homePosn.y", "homePosn.z"]
        ].values.astype(float)
        xyz = xyz.iloc[:, dims]
        home_xyz = home_xyz[:, dims]
        # groupby.apply functions must return DataFrame with same index to preserve shape
        out = pd.DataFrame(np.linalg.norm(xyz - home_xyz, axis=1), index=x.index)
        return out

    dfx["distance"] = dfx.groupby("subject", group_keys=False).apply(
        distance_from_start, dims=[0, 2]
    )

    dfx = dfx.join(euler_to_direction(data=dfx, prefix="rhOri_"))

    return dfx


def find_first_velocity_peak(
    df,
    df_sub,
    dfx,
    dist_range=[0.1, 0.75],
    pv_thresh=0.05,
):
    if "targetDistance" not in df_sub.columns:
        warnings.warn(
            f"'targetDistance' not found in df_sub... Using maximum distance on each trial instead."
        )
    # Peak velocity
    def helper(x):
        sb = x.name[0]  # x["subject"].values[0]
        tn = x.name[1]  # x["trialNumber"].values[0]

        # This may not work for all experiments!
        # try:
        target_distance = df_sub.query("subject == @sb")["targetDistance"].values[0]
        # except KeyError as e:
        #     print(e)
        #     target_distance = x["distance"].max()

        # Apply peak detection while distance to home is within 10% - 75% (default) of target distance
        vel_lwr = dist_range[0] * target_distance
        vel_upr = dist_range[1] * target_distance

        above_vel_lwr = x["distance"] >= vel_lwr
        if not any(above_vel_lwr):
            # warnings.warn(
            #     f"\n\t{x.name}: distance never exceeded lower threshold {vel_lwr:.3f}...\n\tThat's a problem! Examine this trial."
            # )
            g = sns.lineplot(data=x, x="rhPos_x", y="rhPos_z", sort=False)
            g.set_aspect("equal")

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
            g = sns.lineplot(data=x, x="rhPos_x", y="rhPos_z", sort=False)
            g.set_aspect("equal")

        # get the index of the original data frame
        pv_idx = cropped.iloc[first_peak_idx].name  # .name because it's a Series

        pv = x.loc[pv_idx, "velocity"]
        tpv = x.loc[pv_idx, "t"]
        before_pv = x.loc[:pv_idx]
        mask = before_pv["velocity"] <= pv_thresh * pv
        if not any(mask):
            warnings.warn(
                f"Pre-peak velocity never below pv_thresh ({pv_thresh*pv} m/s). (subject, trial) = {x.name}"
            )
            t_onset_pv = before_pv["t"].values[0]
        else:
            t_onset_pv = before_pv.loc[mask, "t"].values[-1]

        # Side effects on df
        sel = (df["subject"] == sb) & (df["trialNumber"] == tn)
        df.loc[sel, "pv"] = pv
        df.loc[sel, "t_pv"] = tpv
        df.loc[sel, "t_onset_pv"] = t_onset_pv

        return

    # Compute movement onset time based on peak velocity threshold
    dfx.groupby(["subject", "trialNumber"]).apply(helper)

    # Subtract onset time from all trials
    dfx = dfx.merge(
        df[["subject", "trialNumber", "t_onset_pv"]],
        how="left",
        on=["subject", "trialNumber"],
    )
    dfx["t_onset"] = dfx["t"] - dfx["t_onset_pv"]

    # Identify onset frame
    dfx["onset_pv"] = dfx["t_onset_pv"] == dfx["t"]

    return df, dfx


def get_nearest_row(df, varname, value):
    """Return row with least difference from specified value"""
    return df.iloc[np.nanargmin(np.abs(df[varname] - value))]


def euler_to_direction(
    euler=None, data=None, prefix=None, dir={"x": 0, "y": 0, "z": -1}
):
    """Sets this quaternion from the rotation specified by Euler angle. Assumes XYZ order."""
    print
    if euler != None and euler["_isEuler"]:
        # default naming from three.js Object3D.rotation
        x = euler["_x"]
        y = euler["_y"]
        z = euler["_z"]
    elif isinstance(data, pd.DataFrame):
        x = data[f"{prefix}x"]
        y = data[f"{prefix}y"]
        z = data[f"{prefix}z"]

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


def get_trial(df, sb=None, tn=None):
    if sb is None:
        sb = random.choice(df["subject"].unique())
    df = df.loc[df["subject"] == sb]
    if tn is None:
        tn = random.choice(df["trialNumber"].unique())
    df = df.loc[df["trialNumber"] == tn]
    return df


# scaled median absolute deviation (cf. Leys et al 2013)
def MAD(x):
    return 1.4826 * np.median(np.abs(x - np.median(x)))


# outlier detection via MAD threshold (cf. Leys et al 2013)
def isoutlier(x, crit=3):
    return np.abs(x - np.median(x)) > crit * MAD(x)


# lm method for apply
def model(df, xname, yname):
    y = df[[yname]].values
    X = df[[xname]].values
    X = X[~np.isnan(y)]
    y = y[~np.isnan(y)]
    X = add_constant(X, True, "add")
    return sm.OLS(y, X).fit()


# predict method for apply
def predict(lm, x):
    return lm.params[0] + x * lm.params[1]


# cubic function (for MACC onset detection)
def cubic(x, b, const):
    return const + b * x**3


# MACC is some garbage (nothing to stop it from fitting two flat lines anywhere...)
def compute_macc_init(before_pv, segment_length=10):
    """[Not recommended!] MACC onset detection (Botzer & Karniel 2009)"""
    out = {}
    best = np.Inf
    for f_0 in range(segment_length, len(before_pv) + 1 - segment_length):
        t_0 = before_pv.iloc[f_0]["t"]
        static_data = before_pv.iloc[range(f_0 - segment_length, f_0)]
        constant_jerk_data = before_pv.iloc[range(f_0, f_0 + segment_length)]
        static_prediction = static_data["hand_z"].mean()
        static_SSE = np.sum((static_prediction - static_data["hand_z"]) ** 2)
        constant_jerk_fit, _, infodict, _, _ = curve_fit(
            lambda x, b: cubic(x, b, static_prediction),
            constant_jerk_data["t"] - t_0,
            constant_jerk_data["hand_z"],
            full_output=True,
        )
        constant_jerk_prediction = infodict["fvec"]
        constant_jerk_SSE = np.sum(
            (constant_jerk_prediction - constant_jerk_data["hand_z"]) ** 2
        )
        RMSE = np.sqrt(static_SSE + constant_jerk_SSE) / (2 * segment_length - 1)
        if RMSE < best:
            best = RMSE
            out.macc_frame = f_0
            out.macc_param = constant_jerk_fit
            out.macc_static = static_prediction
    out._onset_macc = before_pv.iloc[out.macc_frame]["t"]
