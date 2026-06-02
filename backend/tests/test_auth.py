# Verifies M-AUTH (V-M-AUTH): bearer parsing + constant-time token comparison.
from backend.auth import parse_bearer, verify_token


def test_parse_bearer_valid():
    assert parse_bearer("Bearer abc123") == "abc123"
    assert parse_bearer("bearer abc123") == "abc123"  # case-insensitive scheme


def test_parse_bearer_invalid():
    assert parse_bearer(None) is None
    assert parse_bearer("") is None
    assert parse_bearer("Token abc") is None
    assert parse_bearer("Bearer ") is None


def test_verify_token():
    assert verify_token("s3cret", "s3cret") is True
    assert verify_token("wrong", "s3cret") is False
    assert verify_token(None, "s3cret") is False
    assert verify_token("s3cret", "") is False
