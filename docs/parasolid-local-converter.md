# Local Parasolid converter download

For the proposed hosted workflow, see the [Modal service and Auto3D connector plan](parasolid-modal-integration-plan.md). This local package remains available as an alternative.

[Download the converter ZIP](downloads/auto3d-parasolid-local.zip?raw=1) · [SHA-256 checksum](downloads/auto3d-parasolid-local.zip.sha256)

If the download does not start, open the ZIP's GitHub file page and choose **Download raw file**.

This source-only package converts supported Parasolid `.x_t` / `.x_b` files to validated AP242 STEP on your own computer. It contains the converter, instructions, dependency pins, licenses and synthetic tests. It contains no customer CAD, generated models, credentials or virtual environment.

## Run on your own computer

Use Linux or Windows with WSL and Python 3.11 or 3.12. Extract the ZIP and open a terminal in its `auto3d-parasolid-local` folder:

~~~bash
python3 -m venv tools/parasolid/.venv
tools/parasolid/.venv/bin/python -m pip install --only-binary=:all: -r tools/parasolid/requirements.txt
tools/parasolid/.venv/bin/python tools/parasolid/convert.py doctor
~~~

Installation downloads the software dependencies. Your CAD file is not needed during installation. After installation, disconnect networking and run conversion locally. Keep confidential inputs and outputs in a local folder outside cloud-sync directories; a chat attachment would leave your device.

~~~bash
mkdir -p tools/parasolid/out
tools/parasolid/.venv/bin/python tools/parasolid/convert.py inspect /path/to/product.x_t
tools/parasolid/.venv/bin/python tools/parasolid/convert.py convert /path/to/product.x_t --source-unit mm --output tools/parasolid/out/product.step
~~~

**Replace `mm` with the actual unit of the Parasolid coordinates.** Supported units are `m`, `cm`, `mm`, `in`, `ft`; units are never inferred. The output STEP declares millimeters. Unknown units require a supplier confirmation or comparison with a known dimension.

The original file stays unchanged. A successful conversion writes the STEP and a `.conversion.json` report with source identity, units and separate-process reimport checks. Existing outputs are never overwritten. Full instructions are in `tools/parasolid/README.md` inside the ZIP.

## Verify the download

The archive is 17,824 bytes. Its SHA-256 is:

~~~text
909712b26b819b109566bf2c48211e7c2c3f32173ca646a19b0a10b2e343c64a
~~~

For example, compare the checksum in the same folder as the downloaded ZIP:

~~~bash
sha256sum auto3d-parasolid-local.zip
~~~

The archive also includes a `MANIFEST.sha256` for the included source files.

## Current scope

This is a local evaluation tool. Its schema and geometry coverage is a subset of Parasolid; real supplier files still need acceptance testing. It rejects incomplete conversion rather than silently dropping geometry. The included synthetic positive geometry tests bypass the Parasolid parser.

This download does not enable Parasolid in the hosted Auto3D file picker or certify hosted Auto3D, account storage, sharing, AI or agent workflows as device-only. For confidential testing, keep conversion and its results on your computer.

The distribution is documentation-only for Auto3D 0.74.0, Packaging 1.10.7, Primary Products 0.15.0 and Molded Pulp 0.1.0; application and module versions are unchanged.
