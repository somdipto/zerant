#!/usr/bin/env python3
"""
Google Cloud Storage upload module for Nxtscape build artifacts
"""

import os
from pathlib import Path
from typing import List, Optional
from context import BuildContext
from utils import log_info, log_error, log_success, log_warning, IS_WINDOWS, IS_MACOS, join_paths

# Try to import google-cloud-storage
try:
    from google.cloud import storage
    from google.oauth2 import service_account
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

# Service account file name
SERVICE_ACCOUNT_FILE = "gclient.json"


def upload_to_gcs(ctx: BuildContext, file_paths: List[Path]) -> tuple[bool, List[str]]:
    """Upload build artifacts to Google Cloud Storage
    Returns: (success, list of GCS URIs)"""
    if not GCS_AVAILABLE:
        log_warning("google-cloud-storage not installed. Skipping GCS upload.")
        log_info("Install with: pip install google-cloud-storage")
        return True, []  # Not a fatal error
    
    if not file_paths:
        log_info("No files to upload to GCS")
        return True, []
    
    # Determine platform subdirectory
    if IS_WINDOWS:
        platform_dir = "win"
    elif IS_MACOS:
        platform_dir = "macos"
    else:
        platform_dir = "linux"
    
    # Build GCS path: gs://nxtscape/resources/<version>/<platform>/
    bucket_name = "nxtscape"
    gcs_prefix = f"resources/{ctx.nxtscape_version}/{platform_dir}"
    
    log_info(f"\n☁️  Uploading artifacts to gs://{bucket_name}/{gcs_prefix}/")
    
    # Check for service account file
    service_account_path = join_paths(ctx.root_dir, SERVICE_ACCOUNT_FILE)
    if not service_account_path.exists():
        log_error(f"Service account file not found: {SERVICE_ACCOUNT_FILE}")
        log_info(f"Please place the service account JSON file at: {service_account_path}")
        return False, []
    
    try:
        # Initialize GCS client with service account
        credentials = service_account.Credentials.from_service_account_file(
            str(service_account_path)
        )
        client = storage.Client(credentials=credentials)
        bucket = client.bucket(bucket_name)
        
        uploaded_files = []
        gcs_uris = []
        
        for file_path in file_paths:
            if not file_path.exists():
                log_warning(f"File not found, skipping: {file_path}")
                continue
            
            # Determine blob name (file name in GCS)
            blob_name = f"{gcs_prefix}/{file_path.name}"
            
            try:
                blob = bucket.blob(blob_name)
                
                log_info(f"📤 Uploading {file_path.name}...")
                blob.upload_from_filename(str(file_path))
                
                # Note: With uniform bucket-level access, objects inherit bucket's IAM policies
                # No need to set individual object ACLs
                
                public_url = f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
                gcs_uri = f"gs://{bucket_name}/{blob_name}"
                uploaded_files.append(public_url)
                gcs_uris.append(gcs_uri)
                log_success(f"✓ Uploaded: {public_url}")
                    
            except Exception as e:
                log_error(f"Failed to upload {file_path.name}: {e}")
                return False, []
        
        if uploaded_files:
            log_success(f"\n☁️  Successfully uploaded {len(uploaded_files)} file(s) to GCS")
            log_info("\nPublic URLs:")
            for url in uploaded_files:
                log_info(f"  {url}")
        
        return True, gcs_uris
        
    except Exception as e:
        log_error(f"GCS upload failed: {e}")
        return False, []


def upload_package_artifacts(ctx: BuildContext) -> tuple[bool, List[str]]:
    """Upload package artifacts (DMG, ZIP, EXE) to GCS
    Returns: (success, list of GCS URIs)"""
    log_info("\n☁️  Preparing to upload package artifacts to GCS...")
    
    artifacts = []
    
    # Look for files in the dist/<version> directory
    dist_dir = ctx.get_dist_dir()
    if dist_dir.exists():
        if IS_MACOS:
            # Look for DMG files
            artifacts.extend(dist_dir.glob("*.dmg"))
        elif IS_WINDOWS:
            # Look for installer and ZIP files
            artifacts.extend(dist_dir.glob("*.exe"))
            artifacts.extend(dist_dir.glob("*.zip"))
        else:  # Linux
            # Look for AppImage files
            artifacts.extend(dist_dir.glob("*.AppImage"))
    
    if not artifacts:
        log_info("No package artifacts found to upload")
        return True, []
    
    log_info(f"Found {len(artifacts)} artifact(s) to upload:")
    for artifact in artifacts:
        log_info(f"  - {artifact.name}")
    
    return upload_to_gcs(ctx, artifacts)


def upload_signed_artifacts(ctx: BuildContext) -> bool:
    """Upload signed artifacts to GCS"""
    # For now, this is the same as package artifacts
    # Can be extended in the future for specific signed artifacts
    return upload_package_artifacts(ctx)


def download_from_gcs(bucket_name: str, source_path: str, dest_path: Path, ctx: Optional[BuildContext] = None) -> bool:
    """Download a file from GCS (utility function)"""
    if not GCS_AVAILABLE:
        log_error("google-cloud-storage not installed")
        return False
    
    try:
        # Try to use service account if available
        client = None
        if ctx:
            service_account_path = join_paths(ctx.root_dir, SERVICE_ACCOUNT_FILE)
            if service_account_path.exists():
                credentials = service_account.Credentials.from_service_account_file(
                    str(service_account_path)
                )
                client = storage.Client(credentials=credentials)
        
        # Fall back to anonymous client for public buckets
        if not client:
            client = storage.Client.create_anonymous_client()
        
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(source_path)
        
        log_info(f"📥 Downloading gs://{bucket_name}/{source_path}...")
        blob.download_to_filename(str(dest_path))
        log_success(f"Downloaded to: {dest_path}")
        return True
        
    except Exception as e:
        log_error(f"Failed to download from GCS: {e}")
        return False
