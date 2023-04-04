import ouvrai as ou
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("data_folder")
parser.add_argument("save_format")
parser.add_argument("file_regex", default="^data_.*\.json$")
args = parser.parse_args()

df, df_sub, df_frame, df_state = ou.load(
    data_folder=args.data_folder,
    file_regex=args.file_regex,
    save_format=args.save_format,
)
