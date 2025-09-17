#!/usr/bin/env python3
"""
Application signing and notarization module for BrowserOS
NOTE: This module is macOS-specific. Windows signing would require signtool.exe
"""

import os
import sys
import subprocess
import glob
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Tuple
from context import BuildContext
from utils import (
    run_command as utils_run_command,
    log_info,
    log_error,
    log_success,
    log_warning,
    IS_MACOS,
    join_paths,
)


def run_command(
    cmd: List[str],
    cwd: Optional[Path] = None,
    check: bool = True,
) -> subprocess.CompletedProcess:
    """Run a command and handle errors"""
    return utils_run_command(cmd, cwd=cwd, check=check)


def sign(ctx: BuildContext) -> bool:
    """Sign the application"""
    if not ctx.sign_package:
        log_info("\n⏭️  Skipping signing")
        return True

    log_info("\n🔏 Signing application...")

    # When signing is enabled, also create and notarize DMG
    if not sign_app(ctx, create_dmg=True):
        log_error("Signing and notarization failed")
        raise RuntimeError("Signing and notarization failed")

    log_success("Application signed and notarized successfully")
    return True


def check_signing_environment() -> bool:
    """Check if all required environment variables are set for signing (early check)"""
    # Only check on macOS
    if not IS_MACOS:
        return True
    
    required_vars = [
        "MACOS_CERTIFICATE_NAME",
        "PROD_MACOS_NOTARIZATION_APPLE_ID",
        "PROD_MACOS_NOTARIZATION_TEAM_ID",
        "PROD_MACOS_NOTARIZATION_PWD"
    ]
    
    missing = []
    for var in required_vars:
        if not os.environ.get(var):
            missing.append(var)
    
    if missing:
        log_error("❌ Signing requires macOS environment variables!")
        log_error(f"Missing environment variables: {', '.join(missing)}")
        log_error("Please set all required environment variables before signing.")
        return False
    
    return True


def check_environment() -> Tuple[bool, Dict[str, str]]:
    """Check if all required environment variables are set"""
    env_vars = {
        "certificate_name": os.environ.get("MACOS_CERTIFICATE_NAME", ""),
        "apple_id": os.environ.get("PROD_MACOS_NOTARIZATION_APPLE_ID", ""),
        "team_id": os.environ.get("PROD_MACOS_NOTARIZATION_TEAM_ID", ""),
        "notarization_pwd": os.environ.get("PROD_MACOS_NOTARIZATION_PWD", ""),
    }

    missing = []
    for key, value in env_vars.items():
        if not value:
            env_name = {
                "certificate_name": "MACOS_CERTIFICATE_NAME",
                "apple_id": "PROD_MACOS_NOTARIZATION_APPLE_ID",
                "team_id": "PROD_MACOS_NOTARIZATION_TEAM_ID",
                "notarization_pwd": "PROD_MACOS_NOTARIZATION_PWD",
            }[key]
            missing.append(env_name)

    if missing:
        log_error(f"Required environment variables not set: {', '.join(missing)}")
        return False, env_vars

    return True, env_vars


def find_components_to_sign(
    app_path: Path, ctx: Optional[BuildContext] = None
) -> Dict[str, List[Path]]:
    """Dynamically find all components that need signing"""
    components = {
        "helpers": [],
        "xpc_services": [],
        "frameworks": [],
        "dylibs": [],
        "executables": [],
        "apps": [],
    }

    framework_path = join_paths(app_path, "Contents", "Frameworks")

    # Check both versioned and non-versioned paths for BrowserOS Framework
    # Handle both release and debug framework names
    framework_names = ["BrowserOS Framework.framework", "BrowserOS Dev Framework.framework"]
    nxtscape_framework_paths = []
    
    for fw_name in framework_names:
        fw_path = join_paths(framework_path, fw_name)
        if fw_path.exists():
            nxtscape_framework_paths.append(fw_path)
            
            # Add versioned path if context is available
            if ctx and ctx.nxtscape_chromium_version:
                versioned_path = join_paths(fw_path, "Versions", ctx.nxtscape_chromium_version)
                if versioned_path.exists():
                    nxtscape_framework_paths.insert(0, versioned_path)  # Prioritize versioned path

    # Find all helper apps
    for nxtscape_fw_path in nxtscape_framework_paths:
        helpers_dir = join_paths(nxtscape_fw_path, "Helpers")
        if helpers_dir.exists():
            # Find all .app helpers
            components["helpers"].extend(helpers_dir.glob("*.app"))
            # Find all executable helpers (files without extension)
            for item in helpers_dir.iterdir():
                if item.is_file() and not item.suffix and os.access(item, os.X_OK):
                    components["executables"].append(item)
            break  # Use the first valid path found

    # Find all XPC services
    for xpc_path in framework_path.rglob("*.xpc"):
        components["xpc_services"].append(xpc_path)

    # Find all frameworks (with special handling for Sparkle)
    for fw_path in framework_path.rglob("*.framework"):
        components["frameworks"].append(fw_path)

        # Special handling for Sparkle framework versioned structure
        if "Sparkle.framework" in str(fw_path):
            # Look for Sparkle's versioned executables at Versions/B/
            sparkle_version_b = join_paths(fw_path, "Versions", "B")
            if sparkle_version_b.exists():
                # Add Autoupdate executable if it exists
                autoupdate = join_paths(sparkle_version_b, "Autoupdate")
                if autoupdate.exists() and autoupdate.is_file():
                    components["executables"].append(autoupdate)

    # Find all dylibs (check versioned path for BrowserOS Framework libraries)
    for nxtscape_fw_path in nxtscape_framework_paths:
        libraries_dir = join_paths(nxtscape_fw_path, "Libraries")
        if libraries_dir.exists():
            components["dylibs"].extend(libraries_dir.glob("*.dylib"))

    # Also find dylibs in other frameworks
    for dylib_path in framework_path.rglob("*.dylib"):
        if dylib_path not in components["dylibs"]:
            components["dylibs"].append(dylib_path)

    # Find all nested apps (like Updater.app in Sparkle)
    for nested_app in framework_path.rglob("*.app"):
        if nested_app not in components["helpers"]:
            components["apps"].append(nested_app)

    return components


def get_identifier_for_component(
    component_path: Path, base_identifier: str = "com.browseros"
) -> str:
    """Generate identifier for a component based on its path and name"""
    name = component_path.stem

    # Special cases for known components
    special_identifiers = {
        "Downloader": "org.sparkle-project.Downloader",
        "Installer": "org.sparkle-project.Installer",
        "Updater": "org.sparkle-project.Updater",
        "Autoupdate": "org.sparkle-project.Autoupdate",
        "Sparkle": "org.sparkle-project.Sparkle",
        "chrome_crashpad_handler": f"{base_identifier}.crashpad_handler",
        "app_mode_loader": f"{base_identifier}.app_mode_loader",
        "web_app_shortcut_copier": f"{base_identifier}.web_app_shortcut_copier",
    }

    # Check for special cases
    for key, identifier in special_identifiers.items():
        if key in str(component_path):
            return identifier

    # For helper apps
    if "Helper" in name:
        # Extract the helper type (GPU, Renderer, Plugin, Alerts)
        if "(" in name and ")" in name:
            helper_type = name[name.find("(") + 1 : name.find(")")].lower()
            return f"{base_identifier}.helper.{helper_type}"
        else:
            return f"{base_identifier}.helper"

    # For frameworks
    if component_path.suffix == ".framework":
        if name == "BrowserOS Framework" or name == "BrowserOS Dev Framework":
            return f"{base_identifier}.framework"
        else:
            return f"{base_identifier}.{name.replace(' ', '_').lower()}"

    # For dylibs
    if component_path.suffix == ".dylib":
        return f"{base_identifier}.{name}"

    # Default
    return f"{base_identifier}.{name.replace(' ', '_').lower()}"


def get_signing_options(component_path: Path) -> str:
    """Determine signing options based on component type"""
    name = component_path.name

    # For Sparkle XPC services and apps
    if "sparkle" in str(component_path).lower():
        return "runtime"

    # For helper apps with specific requirements
    if (
        "Helper (Renderer)" in name
        or "Helper (GPU)" in name
        or "Helper (Plugin)" in name
    ):
        return "restrict,kill,runtime"

    # Default for most components
    return "restrict,library,runtime,kill"


def sign_component(
    component_path: Path,
    certificate_name: str,
    identifier: Optional[str] = None,
    options: Optional[str] = None,
    entitlements: Optional[Path] = None,
) -> bool:
    """Sign a single component"""
    cmd = ["codesign", "--sign", certificate_name, "--force", "--timestamp"]

    if identifier:
        cmd.extend(["--identifier", identifier])

    if options:
        cmd.extend(["--options", options])

    if entitlements and entitlements.exists():
        cmd.extend(["--entitlements", str(entitlements)])

    cmd.append(str(component_path))

    try:
        run_command(cmd)
        return True
    except Exception as e:
        log_error(f"Failed to sign {component_path}: {e}")
        return False


def sign_all_components(
    app_path: Path,
    certificate_name: str,
    root_dir: Path,
    ctx: Optional[BuildContext] = None,
) -> bool:
    """Sign all components in the correct order (bottom-up)"""
    log_info("🔍 Discovering components to sign...")
    components = find_components_to_sign(app_path, ctx)

    # Print summary
    total_components = sum(len(items) for items in components.values())
    log_info(f"Found {total_components} components to sign:")
    for category, items in components.items():
        if items:
            log_info(f"  • {category}: {len(items)} items")

    # Sign in correct order (bottom-up)
    # 1. Sign XPC Services first
    log_info("\n🔏 Signing XPC Services...")
    for xpc in components["xpc_services"]:
        identifier = get_identifier_for_component(xpc)
        options = get_signing_options(xpc)
        if not sign_component(xpc, certificate_name, identifier, options):
            return False

    # 2. Sign nested apps (like Sparkle's Updater.app)
    if components["apps"]:
        log_info("\n🔏 Signing nested applications...")
        for nested_app in components["apps"]:
            identifier = get_identifier_for_component(nested_app)
            options = get_signing_options(nested_app)
            if not sign_component(nested_app, certificate_name, identifier, options):
                return False

    # 3. Sign executables
    if components["executables"]:
        log_info("\n🔏 Signing executables...")
        for exe in components["executables"]:
            identifier = get_identifier_for_component(exe)
            options = get_signing_options(exe)
            if not sign_component(exe, certificate_name, identifier, options):
                return False

    # 4. Sign dylibs
    if components["dylibs"]:
        log_info("\n🔏 Signing dynamic libraries...")
        for dylib in components["dylibs"]:
            identifier = get_identifier_for_component(dylib)
            if not sign_component(dylib, certificate_name, identifier):
                return False

    # 5. Sign helper apps
    if components["helpers"]:
        log_info("\n🔏 Signing helper applications...")
        # Get entitlements directory from context
        entitlements_dirs = []
        if ctx:
            entitlements_dirs.append(ctx.get_entitlements_dir())

        for helper in components["helpers"]:
            identifier = get_identifier_for_component(helper)
            options = get_signing_options(helper)

            # Check for specific entitlements
            entitlements = None
            entitlements_name = None

            if "Renderer" in helper.name:
                entitlements_name = "helper-renderer-entitlements.plist"
            elif "GPU" in helper.name:
                entitlements_name = "helper-gpu-entitlements.plist"
            elif "Plugin" in helper.name:
                entitlements_name = "helper-plugin-entitlements.plist"

            if entitlements_name:
                for ent_dir in entitlements_dirs:
                    ent_path = join_paths(ent_dir, entitlements_name)
                    if ent_path.exists():
                        entitlements = ent_path
                        break

            if not sign_component(
                helper, certificate_name, identifier, options, entitlements
            ):
                return False

    # 6. Sign frameworks (except the main BrowserOS Framework)
    if components["frameworks"]:
        log_info("\n🔏 Signing frameworks...")
        # Sort to sign Sparkle.framework before BrowserOS Framework.framework
        frameworks_sorted = sorted(
            components["frameworks"], key=lambda x: 0 if "Sparkle" in x.name else 1
        )
        for framework in frameworks_sorted:
            identifier = get_identifier_for_component(framework)
            if not sign_component(framework, certificate_name, identifier):
                return False

    # 7. Sign main executable
    log_info("\n🔏 Signing main executable...")
    # Handle both release and debug executable names
    main_exe_names = ["BrowserOS", "BrowserOS Dev"]
    main_exe = None
    for exe_name in main_exe_names:
        exe_path = join_paths(app_path, "Contents", "MacOS", exe_name)
        if exe_path.exists():
            main_exe = exe_path
            break
    
    if not main_exe:
        log_error(f"Main executable not found in {join_paths(app_path, 'Contents', 'MacOS')}")
        return False
        
    if not sign_component(main_exe, certificate_name, "com.browseros.BrowserOS"):
        return False

    # 8. Finally sign the app bundle
    log_info("\n🔏 Signing application bundle...")
    requirements = (
        '=designated => identifier "com.browseros.BrowserOS" and '
        "anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and "
        "certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */"
    )

    # Try multiple locations for app entitlements
    entitlements = None
    entitlements_names = ["app-entitlements.plist", "app-entitlements-chrome.plist"]
    entitlements_dirs = []
    if ctx:
        entitlements_dirs.append(ctx.get_entitlements_dir())
    else:
        entitlements_dirs.append(join_paths(root_dir, "resources", "entitlements"))
    # Add fallback locations
    entitlements_dirs.extend(
        [
            join_paths(root_dir, "entitlements"),  # Legacy location
            join_paths(root_dir, "build", "src", "chrome", "app"),
            join_paths(app_path.parent.parent.parent, "chrome", "app"),  # Chromium source
        ]
    )

    for ent_name in entitlements_names:
        for ent_dir in entitlements_dirs:
            ent_path = join_paths(ent_dir, ent_name)
            if ent_path.exists():
                entitlements = ent_path
                log_info(f"  Using entitlements: {entitlements}")
                break
        if entitlements:
            break

    cmd = [
        "codesign",
        "--sign",
        certificate_name,
        "--force",
        "--timestamp",
        "--identifier",
        "com.browseros.BrowserOS",
        "--options",
        "restrict,library,runtime,kill",
        "--requirements",
        requirements,
    ]

    if entitlements:
        cmd.extend(["--entitlements", str(entitlements)])
    else:
        log_warning("No app entitlements file found, signing without entitlements")

    cmd.append(str(app_path))

    try:
        run_command(cmd)
    except Exception:
        return False

    return True


def verify_signature(app_path: Path) -> bool:
    """Verify application signature"""
    log_info("\n🔍 Verifying application signature integrity...")

    result = run_command(
        ["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app_path)],
        check=False,
    )

    if result.returncode != 0:
        log_error("Signature verification failed!")
        return False

    log_success("Signature verification passed")
    return True


def notarize_app(
    app_path: Path,
    root_dir: Path,
    env_vars: Dict[str, str],
    ctx: Optional[BuildContext] = None,
) -> bool:
    """Notarize the application"""
    log_info("\n📤 Preparing for notarization...")

    # Create zip for notarization
    notarize_zip = ctx.get_notarization_zip() if ctx else join_paths(root_dir, "notarize.zip")
    if notarize_zip.exists():
        notarize_zip.unlink()

    run_command(["ditto", "-c", "-k", "--keepParent", str(app_path), str(notarize_zip)])
    log_success("Archive created for notarization")

    # Store credentials
    log_info("🔑 Storing notarization credentials...")
    run_command(
        [
            "xcrun",
            "notarytool",
            "store-credentials",
            "notarytool-profile",
            "--apple-id",
            env_vars["apple_id"],
            "--team-id",
            env_vars["team_id"],
            "--password",
            env_vars["notarization_pwd"],
        ],
        check=False,
    )  # May fail if already stored

    # Submit for notarization
    log_info("📤 Submitting application for notarization (this may take a while)...")
    result = run_command(
        [
            "xcrun",
            "notarytool",
            "submit",
            str(notarize_zip),
            "--keychain-profile",
            "notarytool-profile",
            "--wait",
        ],
        check=False,
    )

    log_info(result.stdout)
    if result.stderr:
        log_error(result.stderr)

    if result.returncode != 0:
        log_error("Notarization submission failed")
        return False

    # Check if accepted
    if "status: Accepted" not in result.stdout:
        log_error("App notarization failed - status was not 'Accepted'")
        # Try to extract submission ID for debugging
        for line in result.stdout.split("\n"):
            if "id:" in line:
                submission_id = line.split("id:")[1].strip().split()[0]
                log_info(
                    f'Get detailed logs with: xcrun notarytool log {submission_id} --keychain-profile "notarytool-profile"'
                )
                break
        return False

    log_success("App notarization successful - status: Accepted")

    # Staple the ticket
    log_info("📎 Stapling notarization ticket to application...")
    result = run_command(["xcrun", "stapler", "staple", str(app_path)], check=False)

    if result.returncode != 0:
        log_error("Failed to staple notarization ticket!")
        return False

    log_success("Notarization ticket stapled successfully")

    # Clean up
    notarize_zip.unlink()

    # Verify notarization
    log_info("\n🔍 Verifying notarization status...")

    # Check Gatekeeper
    result = run_command(["spctl", "-a", "-vvv", str(app_path)], check=False)

    if result.returncode != 0:
        log_error("Gatekeeper check failed!")
        return False

    # Validate stapling
    result = run_command(["xcrun", "stapler", "validate", str(app_path)], check=False)

    if result.returncode != 0:
        log_error("Stapler validation failed!")
        return False

    log_success("Notarization and stapling verification passed")
    return True


def sign_app(ctx: BuildContext, create_dmg: bool = True) -> bool:
    """Main signing function that uses BuildContext from build.py"""
    log_info("=" * 70)
    log_info("🚀 Starting signing process for BrowserOS...")
    log_info("=" * 70)

    # Error tracking similar to bash script
    error_count = 0
    error_messages = []

    def track_error(msg: str):
        nonlocal error_count
        error_count += 1
        error_messages.append(f"ERROR {error_count}: {msg}")
        log_error(msg)

    # Check environment
    env_ok, env_vars = check_environment()
    if not env_ok:
        return False

    # Setup app path
    app_path = ctx.get_app_path()

    # Setup DMG path if needed
    dmg_path = None
    if create_dmg:
        dmg_dir = ctx.get_dist_dir()
        dmg_name = ctx.get_dmg_name(True)
        dmg_path = join_paths(dmg_dir, dmg_name)

    # Verify app exists
    if not app_path.exists():
        log_error(f"App not found at: {app_path}")
        return False

    try:
        # Clear extended attributes
        log_info("🧹 Clearing extended attributes...")
        run_command(["xattr", "-cs", str(app_path)])

        # Sign all components
        if not sign_all_components(
            app_path, env_vars["certificate_name"], ctx.root_dir, ctx
        ):
            return False

        # Verify signature
        if not verify_signature(app_path):
            return False

        # Notarize app
        if not notarize_app(app_path, ctx.root_dir, env_vars, ctx):
            return False

        # Create and notarize DMG if requested
        if create_dmg:
            print("\n" + "=" * 70)
            log_info("📦 Creating and notarizing DMG package")
            log_info("=" * 70)

            from modules.package import create_signed_notarized_dmg

            # Find pkg-dmg tool
            pkg_dmg_path = ctx.get_pkg_dmg_path()

            # Create, sign, and notarize DMG
            if dmg_path and not create_signed_notarized_dmg(
                app_path=app_path,
                dmg_path=dmg_path,
                certificate_name=env_vars["certificate_name"],
                volume_name="BrowserOS",
                pkg_dmg_path=pkg_dmg_path,
                keychain_profile="notarytool-profile",
            ):
                log_error("DMG creation/notarization failed")
                return False

    except Exception as e:
        track_error(f"Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        error_count += 1  # For the exception itself

    # Summary report (similar to bash script)
    log_info("=" * 70)
    if error_count > 0:
        log_error(f"Process completed with {error_count} errors:")
        for msg in error_messages:
            log_error(f"  {msg}")
        log_error("Review the errors above and address them before distribution.")
        if create_dmg:
            log_warning(f"Final DMG created at: {dmg_path} (may have issues)")
        return False
    else:
        log_success("Process completed successfully!")
        if create_dmg:
            log_info(f"Final DMG created at: {dmg_path}")
        log_info("The application is properly signed, notarized, and packaged.")
        log_info("=" * 70)
    return error_count == 0


def sign_universal(contexts: List[BuildContext]) -> bool:
    """Create universal binary and sign it"""
    log_info("=" * 70)
    log_info("🔄 Creating and signing universal binary...")
    log_info("=" * 70)

    if len(contexts) < 2:
        log_error("Universal build requires at least 2 architectures")
        return False

    # Verify all app builds exist
    app_paths = []
    for ctx in contexts:
        app_path = ctx.get_app_path()
        if not app_path.exists():
            log_error(f"App not found for {ctx.architecture}: {app_path}")
            return False
        app_paths.append(app_path)
        log_info(f"✓ Found {ctx.architecture} build: {app_path}")

    # Create universal output directory
    universal_dir = join_paths(contexts[0].chromium_src, "out", "Default_universal")
    universal_app_path = join_paths(universal_dir, contexts[0].NXTSCAPE_APP_NAME)

    if universal_dir.exists():
        log_info("Removing existing universal directory...")
        shutil.rmtree(universal_dir)

    universal_dir.mkdir(parents=True, exist_ok=True)

    # Use universalizer script to merge architectures
    universalizer_script = join_paths(contexts[0].root_dir, "build", "universalizer_patched.py")

    if not universalizer_script.exists():
        log_error(f"Universalizer script not found: {universalizer_script}")
        return False

    try:
        cmd = [
            sys.executable,
            str(universalizer_script),
            *[str(app_path) for app_path in app_paths],
            str(universal_app_path),
        ]

        log_info(f"Running universalizer...")
        log_info(f"Command: {' '.join(cmd)}")
        run_command(cmd)

        log_success(f"Universal binary created: {universal_app_path}")

        # Create a temporary context for universal signing
        universal_ctx = BuildContext(
            root_dir=contexts[0].root_dir,
            chromium_src=contexts[0].chromium_src,
            architecture="universal",
            build_type=contexts[0].build_type,
            apply_patches=False,
            sign_package=True,
            package=False,
            build=False,
        )
        # Override out_dir for universal
        universal_ctx.out_dir = "out/Default_universal"

        # Sign the universal binary
        if not sign_app(universal_ctx, create_dmg=False):
            log_error("Failed to sign universal binary")
            return False

        log_success("Universal binary signed successfully!")
        return True

    except Exception as e:
        log_error(f"Failed to create universal binary: {e}")
        return False
