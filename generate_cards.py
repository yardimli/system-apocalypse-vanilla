import os
import json
import base64
import mimetypes
import fal_client
import requests # Used to download the image

# --- Main Configuration ---

# This is a list of tasks to run.
# output_dir has been removed since paths are now defined in the JSON.
TASKS = [
    {
        "json_filename": "public/data/building_upgrades.json",
        "start_prompt": "a building upgrade card for the item for a litrpg game. The cards should only have image no text or stats."
    },
    {
        "json_filename": "public/data/buildings.json",
        "start_prompt": "a building card for the item for a litrpg game. The cards should only have image no text or stats."
    },
    {
        "json_filename": "public/data/monsters.json",
        "start_prompt": "a monster card for the item for a litrpg game. The cards should only have image no text or stats."
    },
    {
        "json_filename": "public/data/cars.json",
        "start_prompt": "a card for the item for a litrpg game, the time period is modern times after year 2020. The cards should only have image no text or stats."
    },
    {
        "json_filename": "public/data/car_upgrades.json",
        "start_prompt": "a card for the item for a litrpg game, the time period is modern times after year 2020. The cards should only have image no text or stats."
    },
    {
        "json_filename": "public/data/items.json",
        "start_prompt": "a game card for an item in a litrpg game."
    },
    {
        "json_filename": "public/data/new_magic_skills.json",
        "start_prompt": "a card for the skill for a litrpg game, the time period is modern times after year 2020. The cards should only have image no text or stats."
    },
    {
        "json_filename": "public/data/new_martial_skills.json",
        "start_prompt": "a card for the skill for a litrpg game, the time period is modern times after year 2020. The cards should only have image no text or stats."
    },
    {
        "json_filename": "public/data/new_cards.json",
        "start_prompt": "a game card for an item in a litrpg game."
    },
]

FAL_MODEL_ID = "fal-ai/gemini-25-flash-image"
FAL_EDIT_MODEL_ID = "fal-ai/gemini-25-flash-image/edit"


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

def get_base64_data_uri(filepath):
    """Reads a local file and returns a Base64 Data URI string."""
    mime_type, _ = mimetypes.guess_type(filepath)
    if not mime_type:
        mime_type = "image/png"  # fallback
    with open(filepath, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_string}"

def on_queue_update(update):
    """Callback for fal_client to print log messages during generation."""
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
           print(log["message"])

def process_task(task_config):
    """Processes a single image generation task based on the provided configuration."""

    # --- 1. Unpack configuration for this task ---
    json_filename = task_config.get("json_filename")
    start_prompt = task_config.get("start_prompt")

    if not all([json_filename, start_prompt]):
        print("Error: Task configuration is missing a required key (json_filename or start_prompt). Skipping.")
        return

    try:
        with open(json_filename, 'r') as f:
            data_entries = json.load(f)
    except FileNotFoundError:
        print(f"Error: JSON file not found at '{json_filename}'. Skipping this task.")
        return
    except Exception as e:
        print(f"Error reading JSON file '{json_filename}': {e}. Skipping this task.")
        return

    print(f"Found {len(data_entries)} entries in '{json_filename}'. Starting generation...")
    print("-" * 30)

    # --- 2. Loop through each entry in the JSON file ---
    for entry in data_entries:
        name = entry.get("name", "Unknown")
        card_images = entry.get("card_images", [])

        if not card_images:
            print(f"Skipping '{name}': No 'card_images' array found.")
            continue

        image_jobs = []
        normal_job = None
        other_jobs = []

        # Parse the card_images array
        for img_data in card_images:
            state = img_data.get("state", "unknown").lower()
            desc = img_data.get("description", "No description available.")
            img_filename = img_data.get("image_file_name", "").lower()
            img_folder = img_data.get("image_folder", "")

            if not img_filename or not img_folder:
                print(f"Warning: Missing 'image_file_name' or 'image_folder' for '{name}' (State: {state}). Skipping this state.")
                continue

            output_path = os.path.join(img_folder, img_filename)

            job_dict = {
                "state_label": state,
                "description": desc,
                "image_folder": img_folder,
                "output_path": output_path,
                "is_edit": state != "normal"
            }

            # Separate normal to guarantee it is processed FIRST
            if state == "normal":
                normal_job = job_dict
            else:
                other_jobs.append(job_dict)

        if normal_job:
            image_jobs.append(normal_job)
        image_jobs.extend(other_jobs)

        # Keep track of the normal image path for edits
        normal_output_path = normal_job["output_path"] if normal_job else None

        # --- 3. Process each required image for the current entry ---
        for job in image_jobs:
            description = job["description"]
            state_label = job["state_label"]
            is_edit = job["is_edit"]
            img_folder = job["image_folder"]
            output_path = job["output_path"]

            # Ensure the target directory exists
            os.makedirs(img_folder, exist_ok=True)

            if os.path.exists(output_path):
                print(f"Skipping '{name}' (State: {state_label}): File already exists at {output_path}")
                continue

            print(f"Processing entry: '{name}' (State: {state_label})...")

            prompt_text = f"""{start_prompt}

{description}

Fantasy art style, vibrant colors, clean design.
The card must be on a simple, clean, plain white background.
The cards should only have image no text or stats.
The card size is classic trading card size, portrait orientation.
The final image should only be the card itself against a white background.
"""

            try:
                if is_edit:
                    if not normal_output_path or not os.path.exists(normal_output_path):
                        print(f"Error: Base 'normal' image not found at '{normal_output_path}'. Cannot generate edit for state '{state_label}'. Skipping.")
                        continue

                    print("Converting normal base image to Data URI...")
                    base_image_data_uri = get_base64_data_uri(normal_output_path)

                    print(f"Subscribing to {FAL_EDIT_MODEL_ID} for edit...")
                    result = fal_client.subscribe(
                        FAL_EDIT_MODEL_ID,
                        arguments={
                            "prompt": prompt_text,
                            "image_urls": [base_image_data_uri]
                        },
                        with_logs=True,
                        on_queue_update=on_queue_update,
                    )
                else:
                    # Standard Text-to-Image Generation (Normal state)
                    print(f"Subscribing to {FAL_MODEL_ID} for text-to-image...")
                    result = fal_client.subscribe(
                        FAL_MODEL_ID,
                        arguments={
                            "prompt": prompt_text,
                            "aspect_ratio": "3:4",
                            "safety_tolerance": 6
                        }
                    )

                # Process the result for both API calls
                if result and 'images' in result and len(result['images']) > 0:
                    image_url = result['images'][0]['url']
                    print(f"Image generated successfully. Downloading to {output_path}...")
                    download_image(image_url, output_path)
                else:
                    print(f"Failed to generate image for '{name}' (State: {state_label}). Response: {result}")

            except Exception as e:
                print(f"An error occurred for '{name}' (State: {state_label}): {e}")

            print("-" * 30)

    print(f"All entries for '{json_filename}' processed.")


def main():
    """Main function to run all configured tasks."""
    if not check_api_key():
        return

    print(f"Starting image generation for {len(TASKS)} configured task(s).")

    for i, task in enumerate(TASKS):
        print(f"\n{'='*50}")
        print(f"RUNNING TASK {i+1}/{len(TASKS)}: Processing '{task.get('json_filename', 'N/A')}'")
        print(f"{'='*50}")

        process_task(task)

        print(f"\n--- FINISHED TASK {i+1}/{len(TASKS)} ---")

    print(f"\n{'='*50}")
    print("All configured tasks have been processed.")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
