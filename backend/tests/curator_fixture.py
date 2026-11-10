"""Explicit test-only app: replaces provider transport before configuring a dummy key.

Production main.py never imports this module. No fake provider mode exists in the app.
"""
from io import BytesIO
import json
import os

import curator
from main import app


def mock_transport(request, timeout):
    assert request.full_url == curator.GEMINI_URL.format(model=curator.DEFAULT_MODEL)
    data = {
        'titles': ['중력과의 협상', '기상 유예의 미학', '이불 속 작은 전시'],
        'description_sentences': ['이 작품은 아침의 작은 사정을 조명합니다.', '이불의 무게는 의지와 현실 사이의 거리를 드러냅니다.'],
    }
    return BytesIO(json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {'role': 'model', 'parts': [
        {'text': json.dumps(data, ensure_ascii=False)}]}}]}).encode())


curator.urlopen = mock_transport
os.environ['GEMINI_API_KEY'] = 'test-only-not-a-real-key'
os.environ['GEMINI_CURATOR_MODEL'] = curator.DEFAULT_MODEL
