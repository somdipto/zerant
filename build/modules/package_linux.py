#!/usr/bin/env python3
"""
Linux AppImage packaging module for BrowserOS
"""

import os
import shutil
import subprocess
from pathlib import Path
from typing import List, Tuple, Optional

from context import BuildContext
from utils import log_info, log_error, log_warning, log_success, run_command, safe_rmtree, join_paths


def prepare_appdir(ctx: BuildContext, appdir: Path) -> bool:
    """Prepare the AppDir structure for AppImage"""
    log_info("📁 Preparing AppDir structure...")
    
    # Create directory structure
    app_root = join_paths(appdir, "opt", "browseros")
    usr_share = join_paths(appdir, "usr", "share")
    icons_dir = join_paths(usr_share, "icons", "hicolor")
    
    # Create directories
    app_root.mkdir(parents=True, exist_ok=True)
    Path(join_paths(usr_share, "applications")).mkdir(parents=True, exist_ok=True)
    Path(join_paths(icons_dir, "256x256", "apps")).mkdir(parents=True, exist_ok=True)
    
    # Copy browser files from out/Default
    out_dir = join_paths(ctx.chromium_src, ctx.out_dir)
    
    # Essential files to copy
    files_to_copy = [
        ctx.NXTSCAPE_APP_NAME,  # This will be "browseros" on Linux
        "chrome_crashpad_handler",
        "chrome_sandbox",
        "chromedriver",
        "libEGL.so",
        "libGLESv2.so",
        "libvk_swiftshader.so",
        "libvulkan.so.1",
        "vk_swiftshader_icd.json",
        "icudtl.dat",
        "snapshot_blob.bin",
        "v8_context_snapshot.bin",
        "chrome_100_percent.pak",
        "chrome_200_percent.pak",
        "resources.pak",
    ]
    
    # Copy files
    for file in files_to_copy:
        src = join_paths(out_dir, file)
        if Path(src).exists():
            shutil.copy2(src, join_paths(app_root, file))
            log_info(f"  ✓ Copied {file}")
        else:
            log_warning(f"  ⚠ File not found: {file}")
    
    # Copy directories
    dirs_to_copy = ["locales", "MEIPreload"]
    for dir_name in dirs_to_copy:
        src = join_paths(out_dir, dir_name)
        if Path(src).exists():
            shutil.copytree(src, join_paths(app_root, dir_name), dirs_exist_ok=True)
            log_info(f"  ✓ Copied {dir_name}/")
    
    # Set executable permissions
    browseros_path = Path(join_paths(app_root, ctx.NXTSCAPE_APP_NAME))
    if browseros_path.exists():
        browseros_path.chmod(0o755)
    
    sandbox_path = Path(join_paths(app_root, "chrome_sandbox"))
    if sandbox_path.exists():
        sandbox_path.chmod(0o4755)  # SUID bit
    
    crashpad_path = Path(join_paths(app_root, "chrome_crashpad_handler"))
    if crashpad_path.exists():
        crashpad_path.chmod(0o755)
    
    # Create desktop file
    desktop_content = f"""[Desktop Entry]
Version=1.0
Name=BrowserOS
GenericName=Web Browser
Comment=Browse the World Wide Web
Exec=/opt/browseros/{ctx.NXTSCAPE_APP_NAME} %U
Terminal=false
Type=Application
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/vnd.mozilla.xul+xml;application/rss+xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/ftp;x-scheme-handler/chrome;video/webm;application/x-xpinstall;
Icon=browseros
"""
    
    desktop_file = Path(join_paths(usr_share, "applications", "browseros.desktop"))
    desktop_file.write_text(desktop_content)
    log_info("  ✓ Created desktop file")
    
    # Also copy desktop file to AppDir root (required by appimagetool)
    appdir_desktop = Path(join_paths(appdir, "browseros.desktop"))
    shutil.copy2(desktop_file, appdir_desktop)
    # Update Exec line to use AppRun
    desktop_content_appdir = desktop_content.replace(f"Exec=/opt/browseros/{ctx.NXTSCAPE_APP_NAME} %U", "Exec=AppRun %U")
    appdir_desktop.write_text(desktop_content_appdir)
    
    # Copy icon from resources
    icon_src = Path(join_paths(ctx.root_dir, "resources", "icons", "product_logo.png"))
    if icon_src.exists():
        icon_dest = Path(join_paths(icons_dir, "256x256", "apps", "browseros.png"))
        shutil.copy2(icon_src, icon_dest)
        log_info("  ✓ Copied icon")
        
        # Also copy icon to AppDir root (following ungoogled-chromium convention)
        appdir_icon = Path(join_paths(appdir, "browseros.png"))
        shutil.copy2(icon_src, appdir_icon)
    else:
        log_warning("  ⚠ Icon not found at resources/icons/product_logo.png")
    
    # Create AppRun script (following ungoogled-chromium convention)
    apprun_content = f"""#!/bin/sh
THIS="$(readlink -f "${{0}}")"
HERE="$(dirname "${{THIS}}")"
export LD_LIBRARY_PATH="${{HERE}}"/opt/browseros:$LD_LIBRARY_PATH
export CHROME_WRAPPER="${{THIS}}"
"${{HERE}}"/opt/browseros/{ctx.NXTSCAPE_APP_NAME} "$@"
"""
    
    apprun_file = Path(join_paths(appdir, "AppRun"))
    apprun_file.write_text(apprun_content)
    apprun_file.chmod(0o755)
    log_info("  ✓ Created AppRun script")
    
    return True


def download_appimagetool(ctx: BuildContext) -> Optional[Path]:
    """Download appimagetool if not available"""
    tool_dir = Path(join_paths(ctx.root_dir, "build", "tools"))
    tool_dir.mkdir(exist_ok=True)
    
    tool_path = Path(join_paths(tool_dir, "appimagetool-x86_64.AppImage"))
    
    if tool_path.exists():
        log_info("✓ appimagetool already available")
        return tool_path
    
    log_info("📥 Downloading appimagetool...")
    url = "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
    
    cmd = ["wget", "-O", str(tool_path), url]
    result = run_command(cmd, check=False)
    
    if result.returncode == 0:
        tool_path.chmod(0o755)
        log_success("✓ Downloaded appimagetool")
        return tool_path
    else:
        log_error("Failed to download appimagetool")
        return None


def create_appimage(ctx: BuildContext, appdir: Path, output_path: Path) -> bool:
    """Create AppImage from AppDir"""
    log_info("📦 Creating AppImage...")
    
    # Download appimagetool if needed
    appimagetool = download_appimagetool(ctx)
    if not appimagetool:
        return False
    
    # Set architecture
    arch = "x86_64" if ctx.architecture == "x64" else "aarch64"
    os.environ["ARCH"] = arch
    
    # Create AppImage
    cmd = [
        str(appimagetool),
        "--comp", "gzip",  # Use gzip compression
        str(appdir),
        str(output_path)
    ]
    
    result = run_command(cmd, check=False)
    
    if result.returncode == 0:
        log_success(f"✓ Created AppImage: {output_path}")
        # Make executable
        output_path.chmod(0o755)
        return True
    else:
        log_error("Failed to create AppImage")
        return False


def package(ctx: BuildContext) -> bool:
    """Package BrowserOS for Linux as AppImage"""
    log_info(f"📦 Packaging {ctx.NXTSCAPE_APP_BASE_NAME} {ctx.get_nxtscape_chromium_version()} for Linux ({ctx.architecture})")
    
    # Create packaging directory
    package_dir = ctx.get_dist_dir()
    package_dir.mkdir(parents=True, exist_ok=True)
    
    # Prepare AppDir
    appdir = Path(join_paths(package_dir, f"{ctx.NXTSCAPE_APP_BASE_NAME}.AppDir"))
    if appdir.exists():
        safe_rmtree(appdir)
    
    if not prepare_appdir(ctx, appdir):
        return False
    
    # Define output filename
    version = ctx.get_nxtscape_chromium_version().replace(" ", "_")
    arch_suffix = "x86_64" if ctx.architecture == "x64" else "arm64"
    filename = f"{ctx.NXTSCAPE_APP_BASE_NAME}-{version}-{arch_suffix}.AppImage"
    output_path = Path(join_paths(package_dir, filename))
    
    # Create AppImage
    if not create_appimage(ctx, appdir, output_path):
        return False
    
    # Clean up AppDir
    safe_rmtree(appdir)
    
    # Store package path in context for GCS upload
    ctx.package_path = output_path
    
    log_success(f"✅ AppImage created: {output_path}")
    log_info(f"   Size: {output_path.stat().st_size / 1024 / 1024:.1f} MB")
    
    return True


def package_universal(contexts: List[BuildContext]) -> bool:
    """Linux doesn't support universal binaries"""
    log_warning("Universal binaries are not supported on Linux")
    return False


def sign_binaries(ctx: BuildContext) -> bool:
    """Linux doesn't require code signing like macOS/Windows"""
    log_info("Code signing is not required for Linux AppImages")
    return True