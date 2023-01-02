import os, json, re, warnings
import numpy as np
import pandas as pd
import statsmodels as sm
from scipy.optimize import curve_fit
from statsmodels.tools import add_constant
from IPython.display import display


def test():
    print("Hello from weblab!")


def load(data_folder="../", file_regex="^data_", from_pkl=False):
    """Load Firebase .json data into data frames.

    Parameters
    ----------
    data_folder : string
        Relative path to data.
    file_regex : string
        Regular expression uniquely identifying data files to load.
    from_pkl : bool
        Load data frames from .pkl files (if they exist)

    Returns
    -------
    df
        Data frame where each row is a trial.
    df_sub
        Data frame where each row is a subject.
    df_frame
        Data frame where each row is a single render loop or movement event.
    df_statechange
        Data frame where each row is a state transition in the experiment finite-state machine.
    """
    try:
        if not from_pkl:
            raise Exception
        df = pd.read_pickle(data_folder + "df.pkl")
        df_sub = pd.read_pickle(data_folder + "df_sub.pkl")
        df_frame = pd.read_pickle(data_folder + "df_frame.pkl")
        df_statechange = pd.read_pickle(data_folder + "df_statechange.pkl")
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

        # Extract list-type columns with frame data and state change data
        reftrial = df.iloc[0]
        numframes_reftrial = len(reftrial["t"])
        numstatechanges_reftrial = len(reftrial["stateChange"])
        reftrial = reftrial[reftrial.apply(isinstance, args=(list,))]
        frame_columns = [
            c for c in reftrial.index if len(reftrial[c]) == numframes_reftrial
        ]
        statechange_columns = [
            c for c in reftrial.index if len(reftrial[c]) == numstatechanges_reftrial
        ]
        df_frame = pd.concat([df.pop(c) for c in frame_columns], axis=1)
        df_statechange = pd.concat([df.pop(c) for c in statechange_columns], axis=1)

        # Explode frame and state change data into long format
        df_frame["subject"] = df["subject"]
        df_frame["trialNumber"] = df["trialNumber"]
        df_frame["cycle"] = df["cycle"]
        df_frame["targetId"] = df["targetId"]
        df_statechange["subject"] = df["subject"]
        df_statechange["trialNumber"] = df["trialNumber"]
        df_frame = df_frame.explode(frame_columns)
        df_statechange = df_statechange.explode(statechange_columns)

        # Expand any object columns (typically x,y,z)
        df = expand_object_columns(df)
        df_sub = expand_object_columns(df_sub)
        df_frame = expand_object_columns(df_frame)
        df_statechange = expand_object_columns(df_statechange)

        df.to_pickle(data_folder + "df.pkl")
        df_sub.to_pickle(data_folder + "df_sub.pkl")
        df_frame.to_pickle(data_folder + "df_frame.pkl")
        df_statechange.to_pickle(data_folder + "df_statechange.pkl")

        df_frame.reset_index(drop=True, inplace=True)

    return df, df_sub, df_frame, df_statechange


def expand_object_columns(df):
    object_columns = df.columns[df.iloc[0].apply(isinstance, args=(dict,))].values
    for col_name in object_columns:
        df = pd.concat(
            [
                df,
                pd.DataFrame(df[col_name].to_list(), index=df.index).add_prefix(
                    f"{col_name}_"
                ),
            ],
            axis=1,
        )
        df = df.drop(col_name, axis=1)
    return df


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


# Velocity computations
def compute_kinematics(df, dfx, pos_prefix="rhPos"):
    diff_cols = ["t", f"{pos_prefix}_x", f"{pos_prefix}_y", f"{pos_prefix}_z"]
    dfx[["dt", "dx", "dy", "dz"]] = dfx.groupby(["subject", "trialNumber"])[
        diff_cols
    ].diff()
    dfx["dpos"] = np.linalg.norm(dfx[["dx", "dy", "dz"]], axis=1)
    dfx["velocity"] = dfx["dpos"] / (dfx["dt"] / 1000)

    # eliminate any frames where there was no movement recorded
    # dfx = dfx[dfx["velocity"] != 0].copy()  # add copy to avoid chained indexing warning

    # REPEAT (after frozen-frame elimination)
    dfx[["dt", "dx", "dy", "dz"]] = dfx.groupby(["subject", "trialNumber"])[
        diff_cols
    ].diff()
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

    # Compute peak velocity and related points
    def onsetPVthresh(x, thresh=0.05, fit_macc=False):
        tn = x["trialNumber"].values[0]
        sb = x["subject"].values[0]
        pv_frame = np.nanargmax(
            x.loc[x["state"] <= 10, "velocity"]
        )  # state.REACH === 10
        # print(pv_frame,len(x))
        pv = x.iloc[pv_frame]["velocity"]
        tpv = x.iloc[pv_frame]["t"]
        before_pv = x.iloc[:pv_frame]
        mask = before_pv["velocity"] <= thresh * pv
        if not any(mask):
            t_onset_pv = before_pv["t"].values[0]
        else:
            t_onset_pv = before_pv.loc[mask, "t"].values[-1]

        # Side effects on df
        sel = (df["subject"] == sb) & (df["trialNumber"] == tn)
        df.loc[sel, "pv_frame"] = pv_frame
        df.loc[sel, "pv"] = pv
        df.loc[sel, "t_pv"] = tpv
        df.loc[sel, "t_onset_pv"] = t_onset_pv
        if fit_macc:
            macc = compute_macc_init(x)
            df.loc[sel, "t_onset_macc"] = macc.t_onset_macc
            df.loc[sel, "param_macc"] = macc.macc_param
            df.loc[sel, "static_macc"] = macc.macc_static
            df.loc[sel, "frame_macc"] = macc.macc_frame

    # Compute movement onset time
    dfx.groupby(["subject", "trialNumber"]).apply(onsetPVthresh)

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


def getDirectionFromEuler(euler, dir={"x": 0, "y": 0, "z": -1}):
    # default naming from three.js Object3D.rotation
    x = euler["_x"]
    y = euler["_y"]
    z = euler["_z"]

    # (Quaternion/setFromEulerAngles)
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

    return out


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


def compute_macc_init(before_pv, segment_length=10):
    out = {}
    # MACC onset detection (Botzer & Karniel 2009)
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
