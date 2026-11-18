"""Checks shared by the PATCH endpoints."""
from fastapi import HTTPException


def reject_nulls(data: dict, *fields: str) -> dict:
    """PATCH bodies may leave a field out, but may not empty one the record can't do without ({"title": null} or
    {"title": "  "}): that is a 422 with the field's name, not a database error."""
    for f in fields:
        if f in data and (data[f] is None or (isinstance(data[f], str) and not data[f].strip())):
            raise HTTPException(422, f"{f} can't be empty")
    return data
