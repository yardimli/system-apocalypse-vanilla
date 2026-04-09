import os
import json
import fal_client
import requests # Used to download the image

# --- Configuration ---
JSON_FILENAME = "public/data/new_martial_skills.json"
OUTPUT_DIR = "public/images/martial_skills3"
FAL_MODEL_ID = "fal-ai/nano-banana-2"

def check_api_key():
    """Checks if the FAL_KEY environment variable is set."""
    if "FAL_KEY" not in os.environ:
        print("Error: The FAL_KEY environment variable is not set.")
        return False
    return True

def download_image(url, filepath):
    """Downloads an image from a URL and saves it to a local file."""
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Successfully saved image to: {filepath}")
    except requests.exceptions.RequestException as e:
        print(f"Error downloading image: {e}")

def main():
    if not check_api_key():
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    try:
        with open(JSON_FILENAME, 'r') as f:
            skills_data = json.load(f)
    except Exception as e:
        print(f"Error reading JSON: {e}")
        return

    print(f"Found {len(skills_data)} skills. Starting generation...")
    print("-" * 30)

    for skill in skills_data:
        name = skill.get("name", "Unknown Skill")
        skill_id = skill.get("id", "0000")

        # --- 1. Construct filename and check for existence ---
        # Moving this to the top of the loop to skip work if file exists
        safe_filename = f"{skill_id}_{name.replace(' ', '_').replace('/', '')}.png"
        output_path = os.path.join(OUTPUT_DIR, safe_filename)

        if os.path.exists(output_path):
            print(f"Skipping '{name}': File already exists at {output_path}")
            continue

        # --- 2. If file doesn't exist, proceed with API call ---
        skill_class = skill.get("class", "General")
        skill_type = skill.get("type", "N/A")
        description = skill.get("description", "No description available.")

        print(f"Processing skill: '{name}'...")

        prompt_text = f"""
a card for the skill for a litrpg game, the time period is modern times after year 2020, but the weapons are classic melee, and armor is a mix of classic and modern. use female for the main person on the cards, the cards should only have image no text or stats.
{{
  "name": "{name}",
  "class": "{skill_class}",
  "type": "{skill_type}",
  "description": "{description}"
}}
pixel art style, vibrant colors, clean design.
The card must be on a simple, clean, plain white background.
The final image should only be the card itself against a white background.
"""

        try:
            result = fal_client.subscribe(
                FAL_MODEL_ID,
                arguments={
                    "prompt": prompt_text,
                    "aspect_ratio": "3:4",
                    "resolution": "1K",
                    "safety_tolerance": 6
                }
            )

            if result and 'images' in result and len(result['images']) > 0:
                image_url = result['images'][0]['url']
                print(f"Image generated. Downloading...")
                download_image(image_url, output_path)
            else:
                print(f"Failed to generate image for '{name}'.")

        except Exception as e:
            print(f"An error occurred for '{name}': {e}")

        print("-" * 30)

    print(f"All skills processed. Files are in '{OUTPUT_DIR}'.")

if __name__ == "__main__":
    main()
