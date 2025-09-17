#!/usr/bin/env python3
"""
Post-build module to fix Info.plist and other post-processing tasks
"""

import plistlib
from pathlib import Path
from context import BuildContext
from utils import log_info, log_success, log_error


def add_sparkle_keys_to_info_plist(ctx: BuildContext):
    """Add Sparkle keys to the built app's Info.plist"""
    app_path = ctx.get_app_path()
    info_plist_path = app_path / "Contents" / "Info.plist"

    if not info_plist_path.exists():
        raise FileNotFoundError(f"Info.plist not found: {info_plist_path}")

    log_info(f"Adding keys to Info.plist: {info_plist_path}")

    # Info.plist.additions file is required
    additions_file = (
        ctx.root_dir / "resources" / "entitlements" / "Info.plist.additions"
    )

    if not additions_file.exists():
        raise FileNotFoundError(
            f"Required file not found: {additions_file}\n"
            "Info.plist.additions is required for build"
        )

    log_info(f"Reading additions from: {additions_file}")

    # Parse the additions file to extract key-value pairs
    import xml.etree.ElementTree as ET

    with open(additions_file, "r") as f:
        additions_content = f.read()

    # Wrap in a root element for parsing
    wrapped_content = f"<plist>{additions_content}</plist>"
    try:
        root = ET.fromstring(wrapped_content)
    except ET.ParseError as e:
        raise ValueError(f"Failed to parse Info.plist.additions: {e}")

    # Read the existing plist
    with open(info_plist_path, "rb") as f:
        plist_data = plistlib.load(f)

    # Parse key-value pairs from additions
    elements = list(root)
    i = 0
    added_count = 0
    while i < len(elements):
        if elements[i].tag == "key":
            key = elements[i].text
            i += 1
            if i < len(elements):
                value_elem = elements[i]
                if value_elem.tag == "string":
                    value = value_elem.text
                elif value_elem.tag == "true":
                    value = True
                elif value_elem.tag == "false":
                    value = False
                elif value_elem.tag == "integer":
                    value = int(value_elem.text)
                else:
                    value = value_elem.text

                plist_data[key] = value
                log_info(f"  Added {key}: {value}")
                added_count += 1
        i += 1

    if added_count == 0:
        raise ValueError("No keys found in Info.plist.additions")

    # Write the updated plist
    with open(info_plist_path, "wb") as f:
        plistlib.dump(plist_data, f)

    log_success(f"Added {added_count} keys to Info.plist from additions file")


def run_postbuild(ctx: BuildContext):
    """Run all post-build tasks"""
    log_info("\n🔧 Running post-build tasks...")

    # Add Sparkle keys - will raise exception if it fails
    # add_sparkle_keys_to_info_plist(ctx)

    # Add other post-build tasks here as needed

    log_success("Post-build tasks completed")

