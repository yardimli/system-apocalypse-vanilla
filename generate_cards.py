import os
import json
import fal_client
import requests # Used to download the image

# --- Configuration ---
# The name of the JSON file containing the skill data
JSON_FILENAME = "public/data/new_magic_skills.json"
# The directory where generated images will be saved
OUTPUT_DIR = "public/images/magic_skills2"
# The Fal.ai model to use for image generation
FAL_MODEL_ID = "fal-ai/nano-banana-2"

def check_api_key():
    """Checks if the FAL_KEY environment variable is set."""
    if "FAL_KEY" not in os.environ:
        print("Error: The FAL_KEY environment variable is not set.")
        print("Please set your Fal AI API key before running the script.")
        print("Example (Linux/macOS): export FAL_KEY='your_key_here'")
        print("Example (Windows): set FAL_KEY=your_key_here")
        return False
    return True

def download_image(url, filepath):
    """Downloads an image from a URL and saves it to a local file."""
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Successfully saved image to: {filepath}")
    except requests.exceptions.RequestException as e:
        print(f"Error downloading image: {e}")

def main():
    """
    Main function to read skill data, generate prompts, call Fal AI,
    and download the resulting images.
    """
    if not check_api_key():
        return

    # Create the output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # --- 1. Read the JSON file ---
    try:
        with open(JSON_FILENAME, 'r') as f:
            skills_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: The file '{JSON_FILENAME}' was not found.")
        print("Please make sure the JSON file is in the same directory as the script.")
        return
    except json.JSONDecodeError:
        print(f"Error: The file '{JSON_FILENAME}' is not a valid JSON file.")
        return

    print(f"Found {len(skills_data)} skills in '{JSON_FILENAME}'. Starting generation...")
    print("-" * 30)

    # --- 2. Loop through each skill and generate an image ---
    for skill in skills_data:
        # Use .get() for safety in case a key is missing
        name = skill.get("name", "Unknown Skill")
        id = skill.get("id", "0000")
        skill_class = skill.get("class", "General")
        skill_type = skill.get("type", "N/A")
        description = skill.get("description", "No description available.")

        print(f"Processing skill: '{name}'...")

        # --- 3. Create the detailed prompt ---
        # This prompt structure is crucial for getting the desired output.
        prompt_text = f"""
a card for the skill for a litrpg game, the time period is modern times after year 2020, but the weapons are classic melee, and armor is a mix of classic and modern. use sensual females for the cards.
{{
  "name": "{name}",
  "class": "{skill_class}",
  "type": "{skill_type}",
  "description": "{description}"
}}
Fantasy art style, vibrant colors, clean design.
The card must be on a simple, clean, plain white background.
Do not add any text except what is provided in the JSON block above.
Do not add any stats like 'Stamina Cost', 'Level Requirement', or 'Damage'.
The final image should only be the card itself against a white background.
"""

        # --- 4. Call the Fal AI API ---
        try:
            result = fal_client.subscribe(
                FAL_MODEL_ID,
                arguments={
                    "prompt": prompt_text,
                    "aspect_ratio": "3:4" # A good aspect ratio for cards
                }
            )

            if result and 'images' in result and len(result['images']) > 0:
                image_url = result['images'][0]['url']
                print(f"Image generated successfully. URL: {image_url}")

                # --- 5. Download and save the image ---
                # Create a safe filename (e.g., "Quick_Strike.png")
                safe_filename = f"{id}_{name.replace(' ', '_').replace('/', '')}.png"
                output_path = os.path.join(OUTPUT_DIR, safe_filename)
                download_image(image_url, output_path)
            else:
                print(f"Failed to generate image for '{name}'. API response was empty or invalid.")

        except Exception as e:
            print(f"An error occurred while calling the Fal AI API for '{name}': {e}")

        print("-" * 30)

    print("All skills processed. Check the 'generated_cards' folder for the images.")

if __name__ == "__main__":
    main()
