# Building Nxtscape

This guide will walk you through building Nxtscape from source on macOS.

## Prerequisites

- macOS (tested on M4 Max)
- Xcode and Command Line Tools
- Python 3
- Git
- ~100GB of free disk space (for Chromium source)
- ~8GB RAM minimum (16GB+ recommended)

## Build Instructions

### Step 1: Checkout Chromium

First, you need to get the Chromium source code. Follow the official Chromium instructions:

1. Visit the [Chromium Get the Code guide](https://www.chromium.org/developers/how-tos/get-the-code/)
2. Follow the macOS-specific instructions to set up depot_tools and fetch Chromium
3. Clone the Chromium repository into a `build` directory inside your nxtscape repository:

```bash
cd /path/to/nxtscape
mkdir build
cd build
# Follow Chromium checkout instructions here
```

### Step 2: Apply Nxtscape Patches

Once you have Chromium checked out, the Nxtscape patches need to be applied to customize the browser with AI features.

### Step 3: Build Nxtscape

Nxtscape provides a Python build script that handles the compilation process.

#### For Debug Build:
```bash
python build/build.py --build --build-type debug
```

#### For Release Build:
```bash
python build/build.py --build --build-type release
```

**Note:** The build process typically takes around 3 hours on an M4 Max laptop. Build times may vary based on your hardware specifications.

### Step 4: Run Nxtscape

After the build completes successfully, you can run Nxtscape using:

```bash
out/Default/Nxtscape.app/Contents/MacOS/Nxtscape --use-mock-keychain
```

The `--use-mock-keychain` flag is used to avoid keychain permission prompts during development.

## Troubleshooting

### Common Issues

1. **Build fails with missing dependencies**
   - Make sure you've followed all prerequisite steps from the Chromium build guide
   - Ensure Xcode is up to date

2. **Out of disk space**
   - Chromium requires significant disk space (~100GB)

### Getting Help

If you encounter issues:
- Join our [Discord](https://discord.gg/YKwjt5vuKr) for community support
- Check existing issues on GitHub
- Review the Chromium build documentation for platform-specific troubleshooting


Happy building! 🚀
