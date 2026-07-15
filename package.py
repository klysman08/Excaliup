import os
import json
import zipfile

def package_extension():
    # Read manifest.json
    manifest_path = "manifest.json"
    if not os.path.exists(manifest_path):
        print("Error: manifest.json not found in current directory.")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        try:
            manifest = json.load(f)
        except Exception as e:
            print(f"Error parsing manifest.json: {e}")
            return

    # Validate manifest_version
    manifest_version = manifest.get("manifest_version")
    if manifest_version != 3:
        print(f"Error: manifest_version is set to {manifest_version}. It must be 3 (integer) for Manifest V3.")
        return

    # Extract name/short_name and version
    short_name = manifest.get("short_name", "ExcaliUp").replace(" ", "")
    version = manifest.get("version", "0.0.0")
    
    dist_dir = "dist"
    os.makedirs(dist_dir, exist_ok=True)
    
    zip_filename = f"{short_name}-{version}-chrome-web-store.zip"
    zip_filepath = os.path.join(dist_dir, zip_filename)
    
    # List of files to package
    files_to_package = [
        "manifest.json",
        "content.js",
        "excaliup-core.js",
        "inject.js",
        "omggif.js",
        "popup.html",
        "popup.css",
        "popup.js",
        "LICENSE",
        "icons/icon16.png",
        "icons/icon48.png",
        "icons/icon128.png",
        "vendor/iconify-icon.min.js",
        "vendor/iconify-icon.LICENSE.txt",
    ]
    
    print(f"Creating package: {zip_filepath}...")
    
    # Check if all files exist before zipping
    missing_files = []
    for file in files_to_package:
        if not os.path.exists(file):
            missing_files.append(file)
            
    if missing_files:
        print("Error: The following required files are missing:")
        for file in missing_files:
            print(f"  - {file}")
        return

    # Write to zip file
    with zipfile.ZipFile(zip_filepath, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file in files_to_package:
            zip_file.write(file)
            print(f"  Added: {file}")
            
    print(f"\nSuccessfully packaged extension to {zip_filepath} ({os.path.getsize(zip_filepath)} bytes)")

if __name__ == "__main__":
    package_extension()
