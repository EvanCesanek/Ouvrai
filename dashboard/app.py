import firebase_admin
from firebase_admin import credentials
from firebase_admin import db
from os.path import join, expanduser
from dash import Dash, dcc, html, dash_table, ctx
from dash.dependencies import Input, Output, State
from dash.exceptions import PreventUpdate
import numpy as np
import pandas as pd
from scipy.optimize import curve_fit
import plotly.express as px
import plotly.graph_objects as go

# Fetch the service account key JSON file contents
cred = credentials.Certificate(join(expanduser("~"), ".firebase/credentials.json"))

# Initialize the app with a service account, granting admin privileges
firebase_admin.initialize_app(
    cred, {"databaseURL": "https://cognitivescience.firebaseio.com"}
)

# Retrieve experiment names
experiment_names = list(db.reference("experiments").get(shallow=True).keys())

# # external_stylesheets = ["https://codepen.io/chriddyp/pen/bWLwgP.css"]
app = Dash(__name__)  # , external_stylesheets=external_stylesheets)

storage = "session"  # memory   session   local

print(
    f"""
*************************************************************
*** weblab: Firebase Dashboard (storage type: {storage})
*************************************************************
"""
)

#
app.layout = html.Div(
    [
        # Memory stores for data
        dcc.Store(id="experiment-data-store", storage_type=storage),
        dcc.Store(id="participant-trialdata-store", storage_type=storage),
        dcc.Store(id="participant-framedata-store", storage_type=storage),
        # Header
        html.H1("weblab: Firebase Dashboard"),
        # Experiment select
        html.Div(
            [
                html.H3("Choose experiment:"),
                dcc.Dropdown(
                    options=experiment_names,
                    id="experiment-dropdown",
                    clearable=False,
                    style={"width": "49%"},
                ),
                html.P(id="experiment-description"),
                "Click here to download experiment data: ",
                html.Button("Download", id="download-experiment-button", disabled=True),
            ],
        ),
        # Experiment data table
        html.Div(
            [
                dash_table.DataTable(
                    data=[{"": ""}],
                    id="experiment-table",
                    page_size=10,
                )
            ],
            style={"margin": "2%"},
        ),
        # Participant select
        html.Div(
            [
                html.H3("Choose participant:"),
                dcc.Dropdown(
                    id="participant-dropdown", clearable=False, style={"width": "50%"}
                ),
                html.H4(id="participant-description"),
                "Click here to download participant data: ",
                html.Button(
                    "Download", id="download-participant-button", disabled=True
                ),
            ],
        ),
        html.Div(
            [
                dash_table.DataTable(
                    data=[{"": ""}],
                    fixed_columns={"headers": True, "data": 1},
                    style_table={"minWidth": "100%"},
                    style_cell={
                        # all three widths are needed
                        "minWidth": "180px",
                        "width": "180px",
                        "maxWidth": "180px",
                        "overflow": "hidden",
                        "textOverflow": "ellipsis",
                    },
                    id="participant-table",
                    page_size=10,
                    # tooltip_data=[
                    #     {
                    #         column: {"value": str(value), "type": "markdown"}
                    #         for column, value in row.items()
                    #     }
                    #     for row in df.to_dict("records")
                    # ],
                    # tooltip_duration=None,
                )
            ],
            style={"margin": "2%"},
        ),
        # Plot modifiers
        html.Div(
            [
                html.H4("Select range of trials to plot (cycles):"),
                dcc.RangeSlider(
                    min=0,
                    max=0,
                    step=1,
                    value=[0, 0],
                    marks={str(x): str(x) for x in np.arange(0, 500, 10)},
                    tooltip={"placement": "bottom", "always_visible": True},
                    id="participant-trial-slider",
                ),
                html.H4(
                    "Select time from movement onset (ms):",
                ),
                dcc.Slider(
                    id="critical-frame-slider",
                    min=50,
                    max=250,
                    step=10,
                    marks={str(x): str(x) for x in np.arange(50, 350, 50)},
                    value=150,
                    # tooltip={"placement": "bottom", "always_visible": True},
                ),
                html.H4(
                    "Toggle velocity profile alignment to movement onset:",
                    style={"display": "inline-block"},
                ),
                html.Button(
                    "Align",
                    id="align-velocity",
                    n_clicks=0,
                    style={"margin-left": "20px", "display": "inline-block"},
                ),
            ],
            style={"margin-left": "1%", "width": "48%"},
        ),
        # Plots
        html.Div(
            [
                html.Div(
                    [
                        dcc.Graph(
                            id="participant-trajectory-xz",
                        ),
                        dcc.Graph(
                            id="participant-trajectory-yz",
                        ),
                    ],
                    style={"display": "table-column", "width": "50%"},
                ),
                html.Div(
                    [
                        dcc.Graph(
                            id="participant-velocity",
                        ),
                        dcc.Graph(
                            id="participant-timeline",
                        ),
                    ],
                    style={"width": "50%"},
                ),
            ],
            style={"display": "flex"},
        ),
        # style={
        #     "display": "flex",
        #     "width": "100%",
        #     "height": "1000px",
        #     "flex-wrap": "wrap",
        #     "flex-direction": "column",
        #     "align-content": "center",
        #     "gap": "0",
        # },
        # ]),
    ]
)


# Toggling enabled/disabled the experiment download button
@app.callback(
    Output("download-experiment-button", "disabled"),
    Input("experiment-description", "children"),
    Input("download-experiment-button", "n_clicks"),
    State("experiment-data-store", "data"),
    prevent_initial_call=True,
)
def toggle_experiment_button(description, n_clicks, data):
    if ctx.triggered_id == "experiment-description" and (
        not data or next(iter(data)) not in description
    ):
        return False
    else:
        return True


# Toggling enabled/disabled the experiment download button
@app.callback(
    Output("download-participant-button", "disabled"),
    Input("participant-description", "children"),
    Input("download-participant-button", "n_clicks"),
    State("participant-trialdata-store", "data"),
    prevent_initial_call=True,
)
def toggle_participant_button(description, n_clicks, data):
    if ctx.triggered_id == "participant-description" and (
        not data or next(iter(data)) not in description
    ):
        return False
    else:
        return True


# When an experiment is selected
@app.callback(
    Output("participant-dropdown", "options"),
    Output("experiment-description", "children"),
    # Output("experiment-table", "data"),
    Input("experiment-dropdown", "value"),
    prevent_initial_call=True,
)
def on_experiment(experiment_name):
    participant_ids = list(
        db.reference(f"experiments/{experiment_name}").get(shallow=True).keys()
    )
    description = (
        f"{experiment_name} contains data from {len(participant_ids)} participant IDs."
    )
    # dictsub = {}
    # for id in participant_ids:
    #     info = db.reference(f"experiments/{experiment_name}/{id}/info").get()
    #     info = pd.json_normalize(info)
    #     info["uid"] = id
    #     info = {id: info}
    #     dictsub = {**dictsub, **info}
    # dfsub = pd.DataFrame(dictsub, index=[0])
    return participant_ids, description  # , dfsub


# When a participant is selected
@app.callback(
    Output("participant-description", "children"),
    Input("participant-dropdown", "value"),
    State("experiment-dropdown", "value"),
    State("participant-trialdata-store", "data"),
    prevent_initial_call=True,
)
def on_participant(participant_id, experiment_name, participant_data):
    if experiment_name:
        ref = db.reference(f"experiments/{experiment_name}/{participant_id}")
        trials = list(ref.get(shallow=True))
        numbered_trials = [int(t) for t in trials if t.isnumeric()]
        other_trials = [t for t in trials if not t.isnumeric()]
        num_trials_completed = len(numbered_trials)
    elif participant_data:
        trials = participant_data.get(participant_id)
        num_trials_completed = len(trials.get("trialNumber"))
        other_trials = False
    else:
        raise PreventUpdate

    description = f"{participant_id} completed {num_trials_completed} trials of {experiment_name}."
    if other_trials:
        description += f" Non-numeric trials: {other_trials}"
    return description


# When download experiment button is clicked
@app.callback(
    Output("experiment-data-store", "data"),
    Input("download-experiment-button", "n_clicks"),
    State("experiment-dropdown", "value"),
    prevent_initial_call=True,
)
def on_download_experiment(_, experiment_name):
    data = {experiment_name: db.reference(f"experiments/{experiment_name}").get()}
    return data


# When experiment data changes
@app.callback(
    # Output("experiment-table", "data"),
    Output("experiment-dropdown", "value"),
    # Since we use the data prop in an output,
    # we cannot get the initial data on load with the data prop.
    # To counter this, you can use the modified_timestamp
    # as Input and the data as State.
    # This limitation is due to the initial None callbacks
    # https://github.com/plotly/dash-renderer/pull/81
    Input("experiment-data-store", "modified_timestamp"),
    State("experiment-data-store", "data"),
    prevent_initial_call=True,
)
def on_experiment_data(ts, data):
    if data is None:
        raise PreventUpdate

    # Create per-subject data
    df = pd.DataFrame()
    experiment_name = next(iter(data))
    data = data.get(experiment_name)
    for si, (s, d) in enumerate(data.items()):  # loop over subjects
        try:
            info = pd.json_normalize(d["info"])  # separate out the 'info'
        except (AttributeError, TypeError):
            print(f"[on_experiment_data]\t{s} has incomplete data. Skipping them.")
            continue
        else:
            info["subject"] = si
            info["uid"] = s
            list_columns = info.loc[0].apply(isinstance, args=(list,))
            info.loc[:, list_columns] = info.loc[:, list_columns].astype(str)
            df = pd.concat([df, info], ignore_index=True)

    return df.to_dict("records"), experiment_name


# When download participant button is clicked
@app.callback(
    Output("participant-trialdata-store", "data"),
    Output("participant-framedata-store", "data"),
    Input("download-participant-button", "n_clicks"),
    State("participant-dropdown", "value"),
    State("experiment-dropdown", "value"),
    State("experiment-data-store", "data"),
    prevent_initial_call=True,
)
def on_download_participant(n_clicks, participant_id, experiment_name, experiment_data):
    # If we already have experiment data that includes the participant, get that
    if experiment_data and participant_id in experiment_data.keys():
        data = experiment_data[participant_id]
    else:
        # otherwise get from Firebase
        data = db.reference(f"experiments/{experiment_name}/{participant_id}").get()

    # Convert list to dict if needed. Because Firebase ref.get() returns
    # a list when all child nodes are consecutive numeric keys.
    if isinstance(data, list):
        data = {str(i): x for i, x in enumerate(data)}

    # Safely isolate 'info' if it exists
    info = data.pop("info", {})

    # Convert to DataFrame
    df = pd.DataFrame.from_dict(data, "index")

    # Deal with info (if desired)
    if not info:
        print(f"[on_participant_data]\t{participant_id} has incomplete data.")
    # else:
    #     info = pd.json_normalize(info)
    #     for key, val in info.items():  # neatly add the 'info' data
    #         if key == "trialNumber":
    #             continue  # skip the trial number of 'info' trial
    #         df[key] = np.repeat(val[0], len(df))

    # Add a subject column out front
    df.insert(0, "subject", participant_id)

    # Get the frame data columns into long format
    dfx = wideToLong(
        df,
        ["t", "rhPos", "state"],  # , "rhOri"],
        ["trialNumber", "targetId", "cycle"],
    )

    # Drop any columns that are lists
    # (mostly frame data, but often includes some others too)
    list_columns = df.columns[df.iloc[0].apply(isinstance, args=(list,))]
    print(f"[on_download_participant] Dropping columns: {list_columns}")
    df = df.drop(list_columns, axis=1)

    # Expand any remaining object-type columns (e.g. Vector3 objects with xyz coords)
    object_columns = df.columns[df.iloc[0].apply(isinstance, args=(dict,))]
    print(f"[on_download_participant] Expanding columns: {object_columns}")
    for col_name in object_columns:
        df = pd.concat(
            [
                df,
                pd.DataFrame(df[col_name].to_list(), index=df.index).add_prefix(
                    f"{col_name}."
                ),
            ],
            axis=1,
        )
        df = df.drop(col_name, axis=1)

    # Extract position data
    dfx = pd.concat(
        [
            dfx.drop(["rhPos"], axis=1),
            dfx["rhPos"]
            .apply(pd.Series)
            .rename({"x": "hand_x", "y": "hand_y", "z": "hand_z"}, axis=1),
        ],
        axis=1,
    )
    dfx["targetId"] = pd.Categorical(dfx["targetId"], ordered=True)

    # Velocity computations
    dfx["dt"] = diff_by_trial(dfx, "t")
    dfx["dx"] = diff_by_trial(dfx, "hand_x")
    dfx["dy"] = diff_by_trial(dfx, "hand_y")
    dfx["dz"] = diff_by_trial(dfx, "hand_z")
    dfx["dpos"] = dfx.apply(lambda x: np.linalg.norm(x[["dx", "dy", "dz"]]), axis=1)
    dfx["dpos_xz"] = dfx.apply(lambda x: np.linalg.norm(x[["dx", "dz"]]), axis=1)
    dfx["cum_distance"] = dfx.groupby("trialNumber")["dpos"].cumsum()
    dfx["cum_distance_xz"] = dfx.groupby("trialNumber")["dpos_xz"].cumsum()
    dfx["velocity"] = dfx["dpos"] / (dfx["dt"] / 1000)

    # Subtract start time from all trials
    dfx = dfx.join(
        dfx.groupby("trialNumber")["t"].min().rename("t_start"),
        how="left",
        on="trialNumber",
    )
    dfx["t_abs"] = dfx["t"]
    dfx["t"] = dfx["t"] - dfx["t_start"]

    # cubic function for onset detection
    def cubic(x, b, const):
        return const + b * x**3

    # Compute peak velocity and related points
    def onsetPVthresh(x, thresh=0.05, segment_length=10):
        tn = x["trialNumber"].values[0]
        pv_frame = np.argmax(x.loc[x["state"] <= 10, "velocity"])  # state.REACH === 10
        pv = x.iloc[pv_frame]["velocity"]
        tpv = x.iloc[pv_frame]["t"]
        before_pv = x.iloc[:pv_frame]
        t_onset_pv = before_pv.loc[before_pv["velocity"] <= thresh * pv, "t"].values[-1]
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
                macc_frame = f_0
                macc_param = constant_jerk_fit
                macc_static = static_prediction
        t_onset_macc = before_pv.iloc[macc_frame]["t"]

        # Side effects
        trial_sel = df["trialNumber"] == tn
        df.loc[trial_sel, "pv_frame"] = pv_frame
        df.loc[trial_sel, "pv"] = pv
        df.loc[trial_sel, "t_pv"] = tpv
        df.loc[trial_sel, "t_onset_pv"] = t_onset_pv
        df.loc[trial_sel, "t_onset_macc"] = t_onset_macc
        df.loc[trial_sel, "param_macc"] = macc_param
        df.loc[trial_sel, "static_macc"] = macc_static
        df.loc[trial_sel, "frame_macc"] = macc_frame

    # Compute movement onset time
    dfx.groupby("trialNumber").apply(onsetPVthresh)

    # Subtract onset time from all trials
    dfx = dfx.merge(df[["trialNumber", "t_onset_pv"]], how="left", on="trialNumber")
    dfx["t_onset"] = dfx["t"] - dfx["t_onset_pv"]

    # Add the participant ID so we have it
    trial_data = {participant_id: df.to_dict()}
    frame_data = {participant_id: dfx.to_dict()}
    return trial_data, frame_data


# When participant data changes
@app.callback(
    Output("participant-table", "data"),
    Output("participant-dropdown", "value"),
    Output("participant-trial-slider", "max"),
    Input("participant-trialdata-store", "modified_timestamp"),
    State("participant-trialdata-store", "data"),
    prevent_initial_call=True,
)
def on_participant_data(ts, data):
    if data is None:
        raise PreventUpdate

    # Per-trial data
    participant_id = next(iter(data))
    data = data.get(participant_id)
    df = pd.DataFrame.from_dict(data)
    return df.to_dict("records"), participant_id, df["cycle"].max()


@app.callback(
    Output("participant-trajectory-xz", "figure"),
    Output("participant-trajectory-yz", "figure"),
    Output("participant-velocity", "figure"),
    Output("participant-timeline", "figure"),
    Output("align-velocity", "children"),
    Input("participant-trial-slider", "value"),
    Input("critical-frame-slider", "value"),
    Input("participant-velocity", "clickData"),
    Input("participant-trajectory-xz", "clickData"),
    Input("align-velocity", "n_clicks"),
    State("participant-trialdata-store", "data"),
    State("participant-framedata-store", "data"),
    prevent_initial_call=False,
)
def on_trial_select(
    trials,
    critical_value,
    click_vel,
    click_traj,
    align,
    participant_data,
    frame_data,
):
    if not participant_data:
        raise PreventUpdate
    participant_id = next(iter(participant_data))
    participant_data = participant_data.get(participant_id)
    frame_data = frame_data.get(participant_id)

    align = (align) % 2

    df = pd.DataFrame.from_dict(participant_data)
    dfx = pd.DataFrame.from_dict(frame_data)

    def critical_frame(x):
        tn = x["trialNumber"].values[0]
        t_onset = df.loc[df["trialNumber"] == tn, "t_onset_pv"]
        target = (t_onset + critical_value).values[0]
        return x.iloc[np.argmin(np.abs(x["t"] - target))]

    # Compute critical frame and timeline
    # Have to do this before we subset if we want to see all trials
    df_crit = dfx.groupby("trialNumber").apply(critical_frame)
    # print(df_crit)
    df = df.merge(
        df_crit[["trialNumber", "t", "hand_x", "hand_z", "velocity"]].reset_index(
            drop=True
        ),
        on="trialNumber",
        how="left",
    )
    # df["crit_x"] = df.apply(lambda x: x["hand_x"] - x["rotationOrigin.x"], axis=1)
    # df["crit_z"] = df.apply(lambda x: x["hand_z"] - x["rotationOrigin.z"], axis=1)
    df["crit_x"] = df.apply(lambda x: x["hand_x"], axis=1)
    df["crit_z"] = df.apply(lambda x: x["hand_z"] - (-0.35), axis=1)
    df["angle"] = df.apply(
        lambda x: (np.arctan2(x["crit_x"], -x["crit_z"]) * 180 / np.pi), axis=1
    )

    # Subset by trial
    # df = df.loc[np.isin(df["cycle"], np.arange(trials[0], trials[1] + 1))]
    dfx = dfx.loc[np.isin(dfx["cycle"], np.arange(trials[0], trials[1] + 1))]

    def extract_onset(x, mode="pv"):
        tn = x["trialNumber"].values[0]
        trial_sel = df["trialNumber"] == tn
        tcrit = df.loc[trial_sel, f"t_onset_{mode}"]
        return x.loc[x["t"].values == tcrit.values[0]]

    onset_data = dfx.groupby("trialNumber").apply(extract_onset)
    # onset_data2 = dfx.groupby("trialNumber").apply(extract_onset, mode="macc")

    def add_points(xname, yname, customnames, df, color="purple", fill=False):
        return go.Scatter(
            x=[df[xname]],
            y=[df[yname]],
            mode="markers",
            marker_color=color if fill else "white",
            marker_line_color=color,
            marker_line_width=2,
            customdata=np.array([df[customnames]]),
            showlegend=False,
        )

    def fade_unselected_traces(fig, opacity=0.1):
        fig.update_traces(
            patch={"opacity": opacity},
            selector=(
                lambda x: (
                    x["customdata"][0] != click_vel["points"][0]["customdata"]
                ).any()
            ),
        )

    # Plot
    trajxz_fig = px.line(
        dfx,
        y="hand_x",
        x="hand_z",
        # y="hand_z",
        # x="t",
        # z="hand_z",
        color="targetId",
        line_group="trialNumber",
        markers=False,
        category_orders={"targetId": [0, 1]},
        custom_data=["cycle", "targetId"],
    )
    # trajxz_fig.update_traces(marker={"size": 2, "opacity": 0.7})
    # trajxz_fig.update_layout(
    #     scene_aspectmode="data",
    #     scene_camera=dict(
    #         up=dict(x=0, y=1, z=0),
    #         eye=dict(x=1, y=0, z=0),
    #         projection={"type": "orthographic"},
    #     ),
    # )
    for i, r in onset_data.iterrows():
        trajxz_fig.add_trace(
            add_points(
                "hand_z", "hand_x", ["cycle", "targetId"], r, color="green", fill=True
            )
        )
    # for i, r in onset_data2.iterrows():
    #     trajxz_fig.add_trace(
    #         add_points("hand_z", "hand_x", ["cycle", "targetId"], r, color="cyan")
    #     )
    for i, r in df.loc[
        np.isin(df["cycle"], np.arange(trials[0], trials[1] + 1))
    ].iterrows():
        trajxz_fig.add_trace(
            add_points("hand_z", "hand_x", ["cycle", "targetId"], r, color="black")
        )
        # trajxz_fig.add_trace(
        #     add_points(
        #         "rotationOrigin.z",
        #         "rotationOrigin.x",
        #         ["cycle", "targetId"],
        #         r,
        #         color="gray",
        #     )
        # )
    trajxz_fig.update_xaxes(autorange="reversed")
    trajxz_fig.update_yaxes(autorange="reversed", scaleanchor="x", scaleratio=1)

    trajyz_fig = px.line(
        dfx,
        y="hand_y",
        x="hand_z",
        # z="hand_z",
        color="targetId",
        line_group="trialNumber",
        markers=False,
        category_orders={"targetId": [0, 1]},
        custom_data=["cycle", "targetId"],
    )
    for i, r in onset_data.iterrows():
        trajyz_fig.add_trace(
            add_points(
                "hand_z", "hand_y", ["cycle", "targetId"], r, color="green", fill=True
            )
        )
    # for i, r in onset_data2.iterrows():
    #     trajyz_fig.add_trace(
    #         add_points("hand_z", "hand_y", ["cycle", "targetId"], r, color="cyan")
    #     )
    trajyz_fig.update_xaxes(autorange="reversed")
    trajyz_fig.update_yaxes(scaleanchor="x", scaleratio=1)

    vel_fig = px.line(
        dfx,
        # x="cum_distance_xz",
        x="t_onset" if align else "t",
        y="velocity",
        color="targetId",
        line_group="trialNumber",
        category_orders={"targetId": [0, 1]},
        custom_data=["cycle", "targetId"],
    )
    for i, r in df.loc[
        np.isin(df["cycle"], np.arange(trials[0], trials[1] + 1))
    ].iterrows():
        if align:
            r["t"] -= r["t_onset_pv"]
        vel_fig.add_trace(
            add_points("t", "velocity", ["cycle", "targetId"], r, color="black")
        )
    if not align:
        for i, r in onset_data.iterrows():
            vel_fig.add_trace(
                add_points(
                    "t", "velocity", ["cycle", "targetId"], r, color="green", fill=True
                )
            )
        # for i, r in onset_data2.iterrows():
        #     vel_fig.add_trace(
        #         add_points("t", "velocity", ["cycle", "targetId"], r, color="cyan")
        #     )

    # def macc_predict(x):
    #     tn = x["trialNumber"].values[0]
    #     trial_sel = df["trialNumber"] == tn
    #     macc_fit = df.loc[
    #         trial_sel, ["param_macc", "frame_macc", "static_macc", "t_onset_macc"]
    #     ].values[0]
    #     static = x.iloc[range(int(macc_fit[1] - 9), int(macc_fit[1]))]
    #     static["t_macc"] = static["t"] - macc_fit[3]
    #     static["hand_z_macc"] = macc_fit[2]
    #     constant_jerk = x.iloc[range(int(macc_fit[1]), int(macc_fit[1] + 10))]
    #     constant_jerk["t_macc"] = constant_jerk["t"] - macc_fit[3]
    #     constant_jerk["hand_z_macc"] = (
    #         macc_fit[2] + macc_fit[0] * constant_jerk["t_macc"] ** 3
    #     )
    #     out = pd.concat([static, constant_jerk], axis=0)
    #     return out

    # macc_data = dfx.groupby("trialNumber").apply(macc_predict)
    # trajxz_fig.add_traces(
    #     px.line(
    #         macc_data,
    #         "t",
    #         "hand_z_macc",
    #         color="targetId",
    #         line_group="trialNumber",
    #         markers=True,
    #         category_orders={"targetId": [0, 1]},
    #     ).data
    # )

    timeline_fig = px.line(
        df,
        x="cycle",
        y="angle",
        color="targetId",
        category_orders={"targetId": [0, 1]},
        markers=True,
    )
    timeline_rotation = px.line(
        df,
        x="cycle",
        y="rotation",
        color="targetId",
        category_orders={"targetId": [0, 1]},
    )
    timeline_rotation.update_traces({"line": {"dash": "dash"}})
    timeline_fig.add_traces(timeline_rotation.data)
    if "participant-velocity.clickData" in ctx.triggered_prop_ids:
        selected_cycle = click_vel["points"][0]["customdata"][0]
        selected_targetId = click_vel["points"][0]["customdata"][1]

        fade_unselected_traces(trajxz_fig)
        fade_unselected_traces(trajyz_fig)
        fade_unselected_traces(vel_fig)

        timeline_fig.update_traces(
            patch={"opacity": 0.1},
            selector=(lambda x: x["name"] != str(selected_targetId)),
        )
        highlight_point = px.scatter(
            df.loc[
                (df["cycle"] == selected_cycle) & (df["targetId"] == selected_targetId)
            ],
            x="cycle",
            y="angle",
        ).data[0]
        highlight_point.marker.color = "white"
        highlight_point.marker.line.color = "black"
        highlight_point.marker.line.width = 2
        highlight_point.marker.size = 8
        timeline_fig.add_trace(highlight_point)

    if "participant-trajectory-xz.clickData" in ctx.triggered_prop_ids:
        print(click_traj)

    return (
        trajxz_fig,
        trajyz_fig,
        vel_fig,
        timeline_fig,
        "Reset" if align else "Align",
    )


def wideToLong(df, longFields, staticFields):
    out = pd.DataFrame()
    df["numFrames"] = df[longFields[0]].transform(lambda x: len(x))
    for fn in longFields:
        out[fn] = np.concatenate(df[fn].values)
    for fn in staticFields:
        out[fn] = np.concatenate(
            df.apply(lambda x: np.repeat(x[fn], x["numFrames"]), axis=1).values
        )
    return out


def diff_by_trial(df_long, column_name):
    return np.concatenate(
        df_long.groupby("trialNumber")
        .apply(lambda x: np.concatenate(([np.nan], np.diff(x[column_name]))))
        .values
    )


# dfx = pd.concat(
#     [
#         dfx.drop(["rhOri"], axis=1),
#         dfx["rhOri"]
#         .apply(getDirectionFromEuler)
#         .apply(pd.Series)
#         .rename({"x": "hand_dir_x", "y": "hand_dir_y", "z": "hand_dir_z"}, axis=1),
#     ],
#     axis=1,
# )

# dfx["dvel"] = np.concatenate(
#     dfx.groupby("trialNumber").apply(
#         lambda x: np.concatenate(([np.nan], np.diff(x["velocity"])))
#     )
# )
# dfx["acceleration"] = dfx["dvel"] / (dfx["dt"] / 1000)

# # Total distance
# dfx = dfx.join(
#     dfx.groupby("trialNumber")["dpos"].sum().rename("total_distance"),
#     how="left",
#     on="trialNumber",
# )

# Transforms Euler angles to a direction vector parallel to grip (along the controller) in world space
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


if __name__ == "__main__":
    app.run(host="localhost", debug=True)
