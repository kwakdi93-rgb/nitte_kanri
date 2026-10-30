import hashlib
import hmac
import re
import secrets
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


COOKIE_NAME = "hibi_session"
SESSION_SECONDS = 12 * 60 * 60
PASSWORD_ROUNDS = 600_000
USERNAME_PATTERN = re.compile(r"[A-Za-z0-9_.-]{3,40}")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), PASSWORD_ROUNDS)
    return f"pbkdf2_sha256${PASSWORD_ROUNDS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt, expected = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class User(BaseModel):
    id: str
    name: str
    username: str
    role: Literal["admin", "user"]


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        value = value.strip()
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("会員IDは3〜40文字の半角英数字・アンダースコア・ピリオド・ハイフンで入力してください。")
        return value

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        if not value or len(value) > 128:
            raise ValueError("パスワードを128文字以内で入力してください。")
        return value


class MemberUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    username: str
    password: str = ""

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 80:
            raise ValueError("会員名は1〜80文字で入力してください。")
        return value

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        return LoginInput.check_username(value)

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        if value and not 8 <= len(value) <= 128:
            raise ValueError("パスワードは8〜128文字で入力してください。")
        return value
