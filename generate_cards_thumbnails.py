import os
import json
from PIL import Image

# --- Main Configuration ---

# This is a list of tasks to run.
# output_dir has been removed since paths are now defined in the JSON.
TASKS = [
    {
        "json_filename": "public/data/building_upgrades.json",
    },
    {
        "json_filename": "public/data/buildings.json",
    },
    {
        "json_filename": "public/data/monsters.json",
    },
    {
        "json_filename": "public/data/cars.json",
    },
    {
        "json_filename": "public/data/car_upgrades.json",
    },
    {
        "json_filename": "public/data/items.json",
    },
    {
        "json_filename": "public/data/new_magic_skills.json",
    },
    {
        "json_filename": "public/data/new_martial_skills.json",
    },
    {
        "json_filename": "public/data/new_cards.json",
    },
]

TARGET_WIDTH = 175

def process_task(task_config):
    """Processes a single task to generate thumbnails for existing images."""

    # --- 1. Unpack configuration for this task ---
    json_filename = task_config.get("json_filename")

    if not json_filename:
        print("Error: Task configuration is missing a required key (json_filename). Skipping.")
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

    print(f"Found {len(data_entries)} entries in '{json_filename}'. Checking for images...")
    print("-" * 30)

    # --- 2. Loop through each entry in the JSON file ---
    for entry in data_entries:
        name = entry.get("name", "Unknown")
        card_images = entry.get("card_images", [])

        if not card_images:
            # Silently skip entries without card_images
            continue

        # --- 3. Process each expected image for the current entry ---
        for img_data in card_images:
            state = img_data.get("state", "unknown").lower()
            img_filename = img_data.get("image_file_name", "").lower()
            img_folder = img_data.get("image_folder", "")

            if not img_filename or not img_folder:
                print(f"Warning: Missing 'image_file_name' or 'image_folder' for '{name}' (State: {state}). Skipping.")
                continue

            # Construct paths based on the JSON data
            original_image_path = os.path.join(img_folder, img_filename)

            # Create the thumbnails subfolder inside the target image folder
            thumbnails_dir = os.path.join(img_folder, "thumbnails")
            os.makedirs(thumbnails_dir, exist_ok=True)

            thumbnail_image_path = os.path.join(thumbnails_dir, img_filename)

            # Check if the original image exists
            if not os.path.exists(original_image_path):
                # Silently skip or print a debug message if the source image doesn't exist yet
                # print(f"Missing original image for '{name}' (State: {state}) at {original_image_path}")
                continue

            # Check if thumbnail already exists to save processing time
            if os.path.exists(thumbnail_image_path):
                print(f"Skipping '{name}' (State: {state}): Thumbnail already exists.")
                continue

            print(f"Creating thumbnail for: '{name}' (State: {state})...")

            try:
                # Open the original image
                with Image.open(original_image_path) as img:
                    # Calculate the new height to maintain aspect ratio
                    width_percent = (TARGET_WIDTH / float(img.size[0]))
                    target_height = int((float(img.size[1]) * float(width_percent)))

                    # Resize the image using LANCZOS (high quality)
                    # PIL automatically preserves transparency (RGBA) when saving as PNG
                    img_resized = img.resize((TARGET_WIDTH, target_height), Image.Resampling.LANCZOS)

                    # Save the thumbnail
                    img_resized.save(thumbnail_image_path, format="PNG")
                    print(f" -> Saved thumbnail to {thumbnail_image_path}")

            except Exception as e:
                print(f"An error occurred while resizing '{name}' (State: {state}): {e}")

    print(f"All entries for '{json_filename}' processed.")


def main():
    """Main function to run all configured tasks."""
    print(f"Starting thumbnail generation for {len(TASKS)} configured task(s).")

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
