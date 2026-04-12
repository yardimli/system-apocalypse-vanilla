import os
import json
from PIL import Image

# --- Main Configuration ---

# This is a list of tasks to run.
TASKS = [
    {
        "json_filename": "public/data/building_upgrades.json",
        "output_dir": "public/images/new_building_upgrades",
    },
    {
        "json_filename": "public/data/buildings.json",
        "output_dir": "public/images/new_buildings",
    },
    {
        "json_filename": "public/data/monsters.json",
        "output_dir": "public/images/new_monsters",
    },
    {
        "json_filename": "public/data/cars.json",
        "output_dir": "public/images/new_cars",
    },
    {
        "json_filename": "public/data/car_upgrades.json",
        "output_dir": "public/images/new_car_upgrades",
    },
    {
        "json_filename": "public/data/items.json",
        "output_dir": "public/images/new_items",
    },
    {
        "json_filename": "public/data/new_magic_skills.json",
        "output_dir": "public/images/new_magic_skills",
    },
    {
        "json_filename": "public/data/new_martial_skills.json",
        "output_dir": "public/images/new_martial_skills",
    },
    {
        "json_filename": "public/data/new_cards.json",
        "output_dir": "public/images/new_cards",
    },
]

TARGET_WIDTH = 175

def process_task(task_config):
    """Processes a single task to generate thumbnails for existing images."""

    # --- 1. Unpack configuration for this task ---
    json_filename = task_config.get("json_filename")
    output_dir = task_config.get("output_dir")

    if not all([json_filename, output_dir]):
        print("Error: Task configuration is missing a required key (json_filename or output_dir). Skipping.")
        return

    # Create the thumbnails subfolder
    thumbnails_dir = os.path.join(output_dir, "thumbnails")
    os.makedirs(thumbnails_dir, exist_ok=True)

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
        entry_id = entry.get("id", "0000")
        safe_name = name.replace(' ', '_').replace('/', '')

        image_jobs = []

        # Check if the entry has an array of states
        if "card_images" in entry and isinstance(entry["card_images"], list):
            for img_data in entry["card_images"]:
                state = img_data.get("state", "unknown")
                image_jobs.append({
                    "state_label": state,
                    "filename_suffix": f"_{state}"
                })
        else:
            # Fallback to single image logic
            image_jobs.append({
                "state_label": "default",
                "filename_suffix": ""
            })

        # --- 3. Process each expected image for the current entry ---
        for job in image_jobs:
            suffix = job["filename_suffix"]
            state_label = job["state_label"]

            # Construct filenames
            original_filename = f"{entry_id}_{safe_name}{suffix}.png"
            # Force the thumbnail filename to be entirely lowercase
            thumbnail_filename = original_filename.lower()

            original_image_path = os.path.join(output_dir, original_filename)
            thumbnail_image_path = os.path.join(thumbnails_dir, thumbnail_filename)

            # Check if the original image exists
            if not os.path.exists(original_image_path):
                # Silently skip or print a debug message if the source image doesn't exist yet
                # print(f"Missing original image for '{name}' (State: {state_label}) at {original_image_path}")
                continue

            # Check if thumbnail already exists to save processing time
            if os.path.exists(thumbnail_image_path):
                print(f"Skipping '{name}' (State: {state_label}): Thumbnail already exists.")
                continue

            print(f"Creating thumbnail for: '{name}' (State: {state_label})...")

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
                print(f"An error occurred while resizing '{name}' (State: {state_label}): {e}")

    print(f"All entries for '{json_filename}' processed. Thumbnails are in '{thumbnails_dir}'.")


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
