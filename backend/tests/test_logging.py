"""Server logs never keep the tokens that file links and the chat WebSocket carry in their address."""
import logging

from app.main import RedactTokens


def access_line(path: str) -> str:
    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d', ("10.0.0.1", "GET", path, "1.1", 200), None)
    RedactTokens().filter(record)
    return record.getMessage()


def test_file_link_tokens_are_hidden_in_access_logs():
    line = access_line("/api/v1/uploads/u123/file?token=eyJhbGciOi.payload.signature")
    assert "eyJhbGciOi" not in line
    assert "token=[hidden]" in line


def test_websocket_token_hidden_and_other_parameters_kept():
    line = access_line("/api/v1/ws?token=secret-value&limit=20")
    assert "secret-value" not in line
    assert "limit=20" in line


def test_lines_without_tokens_are_unchanged():
    assert access_line("/api/v1/people") == '10.0.0.1 - "GET /api/v1/people HTTP/1.1" 200'
