"""CLI for managing seamm_webui local-mode user accounts.

There's no admin UI yet (that's Phase 6) -- this is the only way to create
a "local"-auth-mode account for now. New accounts default to the admin
role (full visibility, same as everyone gets today) rather than
seamm_datastore's real owner/group filtering: Phase 3 is "prove who you
are," not per-user data partitioning -- see dashboard-rewrite-plan.md.
"""

import argparse
import getpass
from pathlib import Path

from seamm_webui.db import get_datastore, init_datastore


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--root",
        default="~/SEAMM",
        help=(
            "The general SEAMM config root; NOT the datastore itself "
            "(default: ~/SEAMM). Same meaning as seamm-webui's own --root."
        ),
    )
    parser.add_argument(
        "--datastore",
        default=None,
        help="The datastore directory (default: '<root>/Jobs').",
    )


def _resolve_datastore_dir(args: argparse.Namespace) -> str:
    if args.datastore:
        return args.datastore
    return str(Path(args.root).expanduser() / "Jobs")


def cmd_create(args: argparse.Namespace) -> None:
    # init_datastore() must run before anything else in this process
    # imports seamm_datastore.database.models -- see db.py's module
    # docstring for why.
    init_datastore(_resolve_datastore_dir(args))
    from seamm_datastore.database.models import User

    ds = get_datastore()

    password = args.password
    if password is None:
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Confirm password: "):
            raise SystemExit("Passwords did not match.")

    try:
        user = User.create(
            username=args.username,
            password=password,
            first_name=args.first_name,
            last_name=args.last_name,
            email=args.email,
            roles=["admin"],
        )
    except ValueError as exc:
        # e.g. the username already exists.
        raise SystemExit(str(exc))

    ds.Session.add(user)
    ds.Session.commit()
    print(f"Created user {user.username!r}.")


def cmd_set_password(args: argparse.Namespace) -> None:
    """Reset an existing user's password.

    Deliberately no --password flag (unlike create, which allows one for
    scripting) -- this always prompts via getpass, so the new password
    never has to be typed anywhere it could be logged or captured (a
    shell's command history, a chat transcript run through a shared
    terminal session, etc.), only into a genuinely hidden terminal prompt.
    """
    init_datastore(_resolve_datastore_dir(args))
    from seamm_datastore.database.models import User

    ds = get_datastore()

    user = User.query.filter_by(username=args.username).one_or_none()
    if user is None:
        raise SystemExit(f"No such user {args.username!r}.")

    password = getpass.getpass("New password: ")
    if password != getpass.getpass("Confirm new password: "):
        raise SystemExit("Passwords did not match.")

    user.password = password
    ds.Session.commit()
    print(f"Password updated for {user.username!r}.")


def cmd_delete(args: argparse.Namespace) -> None:
    init_datastore(_resolve_datastore_dir(args))
    from seamm_datastore.database.models import User

    ds = get_datastore()

    user = User.query.filter_by(username=args.username).one_or_none()
    if user is None:
        raise SystemExit(f"No such user {args.username!r}.")

    if not args.yes:
        confirm = input(f"Delete user {user.username!r}? [y/N] ")
        if confirm.strip().lower() not in ("y", "yes"):
            raise SystemExit("Not deleted.")

    ds.Session.delete(user)
    ds.Session.commit()
    print(f"Deleted user {user.username!r}.")


def cmd_list(args: argparse.Namespace) -> None:
    init_datastore(_resolve_datastore_dir(args))
    from seamm_datastore.database.models import User

    for user in User.query.order_by(User.username).all():
        roles = ", ".join(role.name for role in user.roles)
        print(f"{user.username}\t{user.email or ''}\t{roles}")


def run() -> None:
    parser = argparse.ArgumentParser(
        description="Manage seamm_webui local-auth-mode user accounts."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="Create a new user account.")
    _add_common_args(create)
    create.add_argument("username")
    create.add_argument(
        "--password", default=None, help="Prompted securely if not given."
    )
    create.add_argument("--email", default=None)
    create.add_argument("--first-name", default=None)
    create.add_argument("--last-name", default=None)
    create.set_defaults(func=cmd_create)

    set_password = subparsers.add_parser(
        "set-password", help="Reset an existing user's password."
    )
    _add_common_args(set_password)
    set_password.add_argument("username")
    set_password.set_defaults(func=cmd_set_password)

    delete = subparsers.add_parser("delete", help="Delete a user account.")
    _add_common_args(delete)
    delete.add_argument("username")
    delete.add_argument(
        "--yes", action="store_true", help="Skip the confirmation prompt."
    )
    delete.set_defaults(func=cmd_delete)

    list_cmd = subparsers.add_parser("list", help="List existing user accounts.")
    _add_common_args(list_cmd)
    list_cmd.set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    run()
