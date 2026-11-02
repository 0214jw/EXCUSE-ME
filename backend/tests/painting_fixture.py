"""HTTP integration fixture only; production never imports this or mocks images."""
import base64
from io import BytesIO
import json
import os

import paintings
from main import app
from test_paintings import png

os.environ['OPENAI_IMAGE_ENABLED'] = '1'
os.environ['OPENAI_API_KEY'] = 'test-only-not-a-real-key'


def fake_transport(*args, **kwargs):
    return BytesIO(json.dumps({'data': [{'b64_json': base64.b64encode(png()).decode()}]}).encode())


paintings.urlopen = fake_transport
