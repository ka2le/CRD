"""Browser-compatible transport for public CDN images that reject Node fetch.

Install the optional dependency with:
python -m pip install --target .image-tools -r scripts/image-requirements.txt
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / '.image-tools'))

try:
    from curl_cffi import requests
except ImportError:
    sys.exit('Install the CDN downloader: python -m pip install --target .image-tools -r scripts/image-requirements.txt')

response = requests.get(sys.argv[1], impersonate='chrome', timeout=60)
response.raise_for_status()
if sys.platform == 'win32':
    import msvcrt
    import os
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
sys.stdout.buffer.write(response.content)
