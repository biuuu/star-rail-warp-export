import requests
import json
from opencc import OpenCC

# 初始化 OpenCC 转换器
cc = OpenCC('s2t')

# 获取 JSON 数据
weapon_url = 'https://api.hakush.in/hsr/data/lightcone.json'
character_url = 'https://api.hakush.in/hsr/data/character.json'
version_url = 'https://api.hakush.in/hsr/new.json'

# 语言映射配置
language_map = {
    "zh-cn": "cn",
    "zh-tw": "cn",  # 简体转繁体
    "en-us": "en",
    "ja-jp": "jp",
    "ko-kr": "kr"
}

# 类型映射配置
type_map = {
    "weapon": {"zh-cn": "光锥", "zh-tw": "光錐", "en-us": "Light Cone", "ja-jp": "光円錐", "ko-kr": "무기"},
    "character": {"zh-cn": "角色", "zh-tw": "角色", "en-us": "Character", "ja-jp": "キャラ", "ko-kr": "캐릭터"}
}

def fetch_json(url):
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def transform_data(data, item_type):
    transformed = {lang: {} for lang in language_map.keys()}
    for id, item in data.items():
        for lang, key in language_map.items():
            name = item[key] if lang != 'zh-tw' else cc.convert(item['cn'])
            transformed[lang][id] = {
                "name": name,
                "item_type": type_map[item_type][lang],
                "rank_type": item['rank'][-1]
            }
    return transformed

def main():
    try:
        weapon_data = fetch_json(weapon_url)
        character_data = fetch_json(character_url)
        version_data = fetch_json(version_url)

        transformed_data = {lang: {} for lang in language_map.keys()}

        transformed_data["version"] = version_data["version"]

        weapon_transformed = transform_data(weapon_data, "weapon")
        character_transformed = transform_data(character_data, "character")

        for lang in language_map.keys():
            transformed_data[lang].update(weapon_transformed[lang])
            transformed_data[lang].update(character_transformed[lang])

        with open('./src/idJson.json', 'w', encoding='utf-8') as f:
            json.dump(transformed_data, f, ensure_ascii=False, indent=2)

        print("Data successfully transformed and saved")

    except requests.RequestException as e:
        print(f"Error fetching data: {e}")

if __name__ == "__main__":
    main()
