#!/usr/bin/env python3
"""
Cliniconex Google Ads - OAuth Refresh Token Generator
Generates the refresh token needed to complete your API setup.

Reads client_id and client_secret from config/credentials.yaml,
runs the OAuth consent flow, and writes the refresh_token back.
"""

import sys
from pathlib import Path

# Check if required library is installed
try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("\n❌ ERROR: Required library not installed")
    print("\nRun this command first:")
    print("  pip install google-auth-oauthlib --break-system-packages")
    print("\nThen run this script again.")
    sys.exit(1)

import yaml

CREDS_PATH = Path("config/credentials.yaml")
REDIRECT_URI = "http://localhost"


def generate_refresh_token():
    """Generate OAuth refresh token for Google Ads API."""

    # ── Load credentials from config ──────────────────────────────────
    if not CREDS_PATH.exists():
        print("\n❌ config/credentials.yaml not found.")
        print("   Copy config/credentials.yaml.example and fill in client_id and client_secret first.")
        sys.exit(1)

    with open(CREDS_PATH, "r") as f:
        creds = yaml.safe_load(f) or {}

    ga = creds.get("google_ads", {})
    client_id = ga.get("client_id", "")
    client_secret = ga.get("client_secret", "")

    if not client_id or not client_secret:
        print("\n❌ google_ads.client_id or google_ads.client_secret not set in config/credentials.yaml.")
        sys.exit(1)

    # ── OAuth client configuration ────────────────────────────────────
    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": [REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    scopes = ["https://www.googleapis.com/auth/adwords"]

    print("\n" + "=" * 80)
    print("CLINICONEX GOOGLE ADS API - OAUTH AUTHORIZATION")
    print("=" * 80)
    print("\nThis will generate a URL for you to authorize API access.")
    print("\nIMPORTANT: Sign in with marketing@cliniconex.com — this account")
    print("           has access to the Google Ads manager account.")
    print("\nSteps:")
    print("  1. Open the URL shown below in your browser (use incognito)")
    print("  2. Sign in as marketing@cliniconex.com")
    print("  3. Click 'Allow' to grant access")
    print("  4. Copy the authorization code shown on screen")
    print("  5. Paste it back here")
    print("\n" + "=" * 80)

    input("\nPress ENTER to start authorization...")

    try:
        # Explicitly pass redirect_uri to both the flow and the auth URL
        flow = InstalledAppFlow.from_client_config(
            client_config,
            scopes=scopes,
            redirect_uri=REDIRECT_URI,
        )

        # run_local_server starts a temporary local web server,
        # opens the browser automatically, and captures the auth code
        # from the redirect — no manual copy-paste needed.
        print("\n🌐 Opening browser for authorization...")
        print("   Sign in as marketing@cliniconex.com when prompted.\n")

        credentials = flow.run_local_server(
            port=0,  # pick any available port
            prompt="consent",
            access_type="offline",
        )

        refresh_token = credentials.refresh_token

        if not refresh_token:
            print("\n❌ OAuth flow completed but no refresh token was returned.")
            print("   Try revoking access at https://myaccount.google.com/permissions")
            print("   then run this script again.")
            sys.exit(1)

        # ── Write refresh token back to credentials.yaml ─────────────
        creds["google_ads"]["refresh_token"] = refresh_token

        with open(CREDS_PATH, "w") as f:
            yaml.dump(creds, f, default_flow_style=False, allow_unicode=True)

        print("\n" + "=" * 80)
        print("✅ config/credentials.yaml updated with your refresh token.")
        print("\n🎉 SETUP COMPLETE!")
        print("=" * 80)
        print("\nTest your connection:")
        print("  python main.py test-connection")
        print("\nRun the full dashboard:")
        print("  python main.py dashboard")
        print("\n" + "=" * 80)

        return refresh_token

    except Exception as e:
        print(f"\n❌ Error during OAuth flow: {e}")
        print("\nTroubleshooting:")
        print("  - Make sure you signed in as marketing@cliniconex.com")
        print("  - Verify your internet connection")
        print("  - Try revoking access at https://myaccount.google.com/permissions")
        sys.exit(1)


if __name__ == "__main__":
    print("\n🚀 Starting Cliniconex Google Ads API Setup...\n")
    generate_refresh_token()