#!/usr/bin/env python3
"""Small stdlib FTP helper for manual Chronos-2 cache transfers."""

import argparse
import ftplib
import os
from pathlib import Path


def connect():
    host = os.environ["FORECAST_FTP_HOST"]
    port = int(os.environ.get("FORECAST_FTP_PORT") or "21")
    user = os.environ["FORECAST_FTP_USER"]
    password = os.environ["FORECAST_FTP_PASSWORD"]
    ftp = ftplib.FTP()
    ftp.connect(host, port, timeout=30)
    ftp.login(user, password)
    root = os.environ.get("FORECAST_FTP_REMOTE_ROOT", "").strip()
    if root:
        ftp.cwd(root)
    return ftp


def ensure_remote_dir(ftp, path):
    current = ftp.pwd()
    try:
        for part in path.strip("/").split("/"):
            if not part or part == ".":
                continue
            try:
                ftp.cwd(part)
            except ftplib.error_perm:
                ftp.mkd(part)
                ftp.cwd(part)
    finally:
        ftp.cwd(current)


def remote_parent(path):
    path = path.strip("/")
    parent, _, name = path.rpartition("/")
    return parent, name


def download(args):
    ftp = connect()
    try:
        parent, name = remote_parent(args.remote)
        if parent:
            ftp.cwd(parent)
        Path(args.local).parent.mkdir(parents=True, exist_ok=True)
        with open(args.local, "wb") as output:
            ftp.retrbinary(f"RETR {name}", output.write)
    finally:
        ftp.quit()


def publish(args):
    ftp = connect()
    try:
        for remote in (args.cache_remote, args.history_remote):
            parent, _ = remote_parent(remote)
            ensure_remote_dir(ftp, parent)
        cache_parent, cache_name = remote_parent(args.cache_remote)
        history_parent, history_name = remote_parent(args.history_remote)
        temp_name = cache_name + f".tmp.{os.environ.get('GITHUB_RUN_ID', 'manual')}"
        with open(args.local, "rb") as source:
            ftp.cwd(history_parent or "/")
            ftp.storbinary(f"STOR {history_name}", source)
        with open(args.local, "rb") as source:
            ftp.cwd(cache_parent or "/")
            ftp.storbinary(f"STOR {temp_name}", source)
        try:
            ftp.delete(cache_name)
        except ftplib.error_perm:
            pass
        ftp.rename(temp_name, cache_name)
    finally:
        ftp.quit()


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action", required=True)
    get = sub.add_parser("download")
    get.add_argument("--remote", required=True)
    get.add_argument("--local", required=True)
    put = sub.add_parser("publish")
    put.add_argument("--local", required=True)
    put.add_argument("--cache-remote", required=True)
    put.add_argument("--history-remote", required=True)
    args = parser.parse_args()
    (download if args.action == "download" else publish)(args)


if __name__ == "__main__":
    main()
