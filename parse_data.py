import ijson
import time
from generate_seo_descriptions import generate_seo_description


def read_file(file_path: str):
    with open(file_path, "rb") as f:
        for product in ijson.items(f, "item"):
            desc = generate_seo_description(product=product)
            print(f"{desc}\n\n")


read_file("ALDI_Mobilya__TR_19.12.24_482468.json")
