"""
Cliniconex Marketing Intelligence Center — Main Dashboard Orchestrator

Ties together all agents (data connectors + revenue analyst) and presents
a unified CLI dashboard using Click and Rich.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

import click
import yaml
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.columns import Columns
from rich.text import Text

from agents.data_connector.activecampaign import ActiveCampaignConnector
from agents.data_connector.google_ads import GoogleAdsConnector
from agents.revenue_analyst.calculator import RevenueCalculator

console = Console()

# ── Configuration helpers ────────────────────────────────────────────────────

CONFIG_DIR = Path(__file__).resolve().parent / "config"


def load_credentials() -> dict:
    """Load API credentials from config/credentials.yaml."""
    path = CONFIG_DIR / "credentials.yaml"
    if not path.exists():
        console.print("[bold red]Error:[/] config/credentials.yaml not found.")
        sys.exit(1)
    with open(path, "r") as f:
        return yaml.safe_load(f)


def load_thresholds() -> dict:
    """Load business thresholds from config/thresholds.yaml."""
    path = CONFIG_DIR / "thresholds.yaml"
    if not path.exists():
        console.print("[bold red]Error:[/] config/thresholds.yaml not found.")
        sys.exit(1)
    with open(path, "r") as f:
        return yaml.safe_load(f)


# ── Connector factories ─────────────────────────────────────────────────────


def build_activecampaign(creds: dict) -> ActiveCampaignConnector:
    ac = creds["activecampaign"]
    return ActiveCampaignConnector(api_url=ac["api_url"], api_key=ac["api_key"])


def build_google_ads(creds: dict) -> GoogleAdsConnector:
    ga = creds["google_ads"]
    return GoogleAdsConnector(
        developer_token=ga["developer_token"],
        client_id=ga["client_id"],
        client_secret=ga["client_secret"],
        refresh_token=ga["refresh_token"],
        customer_id=ga["customer_id"],
        login_customer_id=ga["login_customer_id"],
    )


# ── Helpers ──────────────────────────────────────────────────────────────────


def _status_indicator(pct_complete: float) -> str:
    """Return a colour-coded status string based on percentage of target."""
    if pct_complete >= 90:
        return "[bold green]🟢 ON TRACK[/]"
    if pct_complete >= 60:
        return "[bold yellow]🟡 MONITOR[/]"
    return "[bold red]🔴 BEHIND PACE[/]"


def _cpa_indicator(cpa: float, thresholds: dict) -> str:
    """Colour-code a CPA value against thresholds."""
    if cpa <= thresholds["cpa"]["excellent"]:
        return f"[green]${cpa:,.2f}[/]"
    if cpa <= thresholds["cpa"]["warning"]:
        return f"[yellow]${cpa:,.2f}[/]"
    return f"[red]${cpa:,.2f}[/]"


def _current_quarter() -> str:
    """Return the current calendar quarter label, e.g. 'Q1'."""
    month = datetime.now().month
    return f"Q{(month - 1) // 3 + 1}"


def _quarter_dates(quarter: str, year: int | None = None):
    """Return (start, end) datetimes for the given quarter."""
    year = year or datetime.now().year
    starts = {"Q1": 1, "Q2": 4, "Q3": 7, "Q4": 10}
    start_month = starts[quarter.upper()]
    start = datetime(year, start_month, 1)
    if start_month + 3 > 12:
        end = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = datetime(year, start_month + 3, 1) - timedelta(days=1)
    return start, end


def _days_remaining_in_quarter() -> int:
    """Calendar days left in the current quarter."""
    q = _current_quarter()
    _, end = _quarter_dates(q)
    return max((end - datetime.now()).days, 0)


# ── CLI ──────────────────────────────────────────────────────────────────────


@click.group()
def cli():
    """Cliniconex Marketing Intelligence Center"""
    pass


# ── dashboard ────────────────────────────────────────────────────────────────


@cli.command()
def dashboard():
    """Show the full revenue intelligence dashboard."""

    creds = load_credentials()
    thresholds = load_thresholds()
    calc = RevenueCalculator(
        default_avg_deal_size=thresholds["deal_size"]["average"]
    )

    quarter = _current_quarter()
    quarter_key = f"{quarter.lower()}_target"
    revenue_target = thresholds["revenue"].get(quarter_key, 0)
    q_start, q_end = _quarter_dates(quarter)
    days_left = _days_remaining_in_quarter()

    # ── Fetch live data ──────────────────────────────────────────────────
    ac_data = {"contacts": [], "deals": []}
    gads_campaigns = []
    gads_metrics = {}
    ac_connected = False
    gads_connected = False

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True,
    ) as progress:
        # ActiveCampaign
        task = progress.add_task("Connecting to ActiveCampaign...", total=None)
        try:
            ac = build_activecampaign(creds)
            ac_connected = ac.test_connection()
            if ac_connected:
                ac_data["contacts"] = ac.fetch_contacts(limit=100)
                ac_data["deals"] = ac.fetch_deals(limit=100)
        except Exception as exc:
            console.print(f"[dim]ActiveCampaign error: {exc}[/]")
        progress.remove_task(task)

        # Google Ads
        task = progress.add_task("Connecting to Google Ads...", total=None)
        try:
            gads = build_google_ads(creds)
            gads_connected = gads.test_connection()
            if gads_connected:
                gads_campaigns = gads.fetch_campaigns(q_start, q_end)
                gads_metrics = gads.fetch_performance_metrics(q_start, q_end)
        except Exception as exc:
            console.print(f"[dim]Google Ads error: {exc}[/]")
        progress.remove_task(task)

    # ── Compute pipeline revenue from deals ──────────────────────────────
    pipeline_value = sum(float(d.get("value", 0)) for d in ac_data["deals"])

    # ── Revenue calculations ─────────────────────────────────────────────
    gap = calc.calculate_gap(
        target=revenue_target,
        current=pipeline_value,
        time_remaining=days_left,
    )
    leads = calc.calculate_leads_needed(
        revenue_target=revenue_target - pipeline_value,
        conversion_rates=thresholds.get("conversion_rates"),
    )
    funnel = calc.analyze_funnel(ac_data["contacts"], ac_data["deals"])

    # ── Header panel ─────────────────────────────────────────────────────
    pct = gap["pct_complete"]
    status = _status_indicator(pct)

    header_lines = [
        f"[bold]🎯 {quarter} TARGET:[/] ${revenue_target:,.0f}",
        f"   Current: ${pipeline_value:,.0f} ({pct:.1f}%)",
        f"   Status: {status}",
        "",
        f"[bold]📊 LEADS NEEDED:[/] {leads['contacts_needed']:,} contacts",
    ]
    if gap["required_daily_pace"]:
        daily_deals = calc.calculate_leads_needed(
            revenue_target=gap["required_daily_pace"],
            conversion_rates=thresholds.get("conversion_rates"),
        )
        header_lines.append(
            f"   Required daily: {daily_deals['contacts_needed']:,} leads/day"
        )
    header_lines.append(f"   Days remaining: {days_left}")

    console.print()
    console.print(
        Panel(
            "\n".join(header_lines),
            title="[bold white]CLINICONEX MARKETING INTELLIGENCE CENTER[/]",
            border_style="bright_blue",
            padding=(1, 2),
        )
    )

    # ── Funnel conversion table ──────────────────────────────────────────
    funnel_table = Table(
        title="Funnel Conversion Rates", border_style="cyan", show_lines=True
    )
    funnel_table.add_column("Stage", style="bold")
    funnel_table.add_column("Count", justify="right")
    funnel_table.add_column("Conv. Rate", justify="right")

    for stage in funnel["stage_breakdown"]:
        rate = stage.get("rate_from_previous")
        rate_str = f"{rate:.1%}" if rate is not None else "—"
        funnel_table.add_row(
            stage["stage"], f"{stage['count']:,}", rate_str
        )
    console.print(funnel_table)

    # ── Channel breakdown (Google Ads) ───────────────────────────────────
    if gads_campaigns:
        channel_table = Table(
            title="Google Ads Campaign Breakdown",
            border_style="magenta",
            show_lines=True,
        )
        channel_table.add_column("Campaign", style="bold", max_width=30)
        channel_table.add_column("Clicks", justify="right")
        channel_table.add_column("Conversions", justify="right")
        channel_table.add_column("Cost", justify="right")
        channel_table.add_column("CPA", justify="right")
        channel_table.add_column("Status")

        for c in gads_campaigns:
            cpa = c["cost"] / c["conversions"] if c["conversions"] else 0
            cpa_str = _cpa_indicator(cpa, thresholds)
            status_str = (
                "[green]Active[/]" if c["status"] == "ENABLED" else "[dim]Paused[/]"
            )
            channel_table.add_row(
                c["name"],
                f"{c['clicks']:,}",
                f"{c['conversions']:.0f}",
                f"${c['cost']:,.2f}",
                cpa_str,
                status_str,
            )
        console.print(channel_table)

        # Aggregate metrics
        if gads_metrics:
            console.print(
                Panel(
                    f"Impressions: {gads_metrics['impressions']:,}  |  "
                    f"Clicks: {gads_metrics['clicks']:,}  |  "
                    f"CTR: {gads_metrics['ctr']:.2%}  |  "
                    f"Avg CPC: ${gads_metrics['avg_cpc']:.2f}  |  "
                    f"Total Spend: ${gads_metrics['cost']:,.2f}",
                    title="Google Ads Summary",
                    border_style="magenta",
                )
            )
    else:
        console.print("[dim]No Google Ads campaign data available.[/]")

    # ── CPA Alerts ───────────────────────────────────────────────────────
    alerts = []
    cpa_critical = thresholds["cpa"]["critical"]
    for c in gads_campaigns:
        cpa = c["cost"] / c["conversions"] if c["conversions"] else 0
        if cpa > cpa_critical and c["conversions"] > 0:
            alerts.append(
                f"[red]🔴 {c['name']}: CPA ${cpa:,.2f} exceeds "
                f"${cpa_critical} threshold[/]"
            )
        zero_limit = thresholds["budget"]["zero_conversion_limit"]
        if c["conversions"] == 0 and c["cost"] > zero_limit:
            alerts.append(
                f"[red]🔴 {c['name']}: ${c['cost']:,.2f} spent with "
                f"0 conversions (limit ${zero_limit})[/]"
            )

    if alerts:
        console.print(
            Panel(
                "\n".join(alerts),
                title="[bold red]⚠ ALERTS[/]",
                border_style="red",
            )
        )
    else:
        console.print(
            Panel(
                "[green]No active alerts — all campaigns within thresholds.[/]",
                title="Alerts",
                border_style="green",
            )
        )

    # ── Connection status footer ─────────────────────────────────────────
    ac_status = "[green]Connected[/]" if ac_connected else "[red]Disconnected[/]"
    gads_status = "[green]Connected[/]" if gads_connected else "[red]Disconnected[/]"
    console.print(
        Panel(
            f"ActiveCampaign: {ac_status}  |  Google Ads: {gads_status}  |  "
            f"Last refresh: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            border_style="dim",
        )
    )


# ── test-connection ──────────────────────────────────────────────────────────


@cli.command("test-connection")
def test_connection():
    """Test all API connections."""

    creds = load_credentials()
    results = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True,
    ) as progress:
        # ActiveCampaign
        task = progress.add_task("Testing ActiveCampaign...", total=None)
        try:
            ac = build_activecampaign(creds)
            results["ActiveCampaign"] = ac.test_connection()
        except Exception as exc:
            results["ActiveCampaign"] = False
            console.print(f"[dim]  {exc}[/]")
        progress.remove_task(task)

        # Google Ads
        task = progress.add_task("Testing Google Ads...", total=None)
        try:
            gads = build_google_ads(creds)
            results["Google Ads"] = gads.test_connection()
        except Exception as exc:
            results["Google Ads"] = False
            console.print(f"[dim]  {exc}[/]")
        progress.remove_task(task)

    table = Table(title="Connection Status", border_style="cyan")
    table.add_column("Service", style="bold")
    table.add_column("Status", justify="center")

    for service, ok in results.items():
        indicator = "[green]🟢 Connected[/]" if ok else "[red]🔴 Failed[/]"
        table.add_row(service, indicator)

    console.print(table)

    all_ok = all(results.values())
    if all_ok:
        console.print("\n[bold green]All connections healthy![/]")
    else:
        console.print("\n[bold red]Some connections failed — check credentials.yaml[/]")
        sys.exit(1)


# ── analyze ──────────────────────────────────────────────────────────────────


@cli.command()
@click.option(
    "--start-date",
    required=True,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="Start date (YYYY-MM-DD)",
)
@click.option(
    "--end-date",
    required=True,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="End date (YYYY-MM-DD)",
)
def analyze(start_date: datetime, end_date: datetime):
    """Analyze marketing performance for a specific date range."""

    creds = load_credentials()
    thresholds = load_thresholds()
    calc = RevenueCalculator(
        default_avg_deal_size=thresholds["deal_size"]["average"]
    )

    console.print(
        Panel(
            f"[bold]Analyzing:[/] {start_date:%Y-%m-%d} → {end_date:%Y-%m-%d}",
            border_style="bright_blue",
        )
    )

    # ── Fetch data ───────────────────────────────────────────────────────
    gads_campaigns = []
    gads_metrics = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True,
    ) as progress:
        task = progress.add_task("Fetching Google Ads data...", total=None)
        try:
            gads = build_google_ads(creds)
            gads_campaigns = gads.fetch_campaigns(start_date, end_date)
            gads_metrics = gads.fetch_performance_metrics(start_date, end_date)
        except Exception as exc:
            console.print(f"[dim]Google Ads error: {exc}[/]")
        progress.remove_task(task)

    # ── Performance summary ──────────────────────────────────────────────
    if gads_metrics:
        total_cost = gads_metrics["cost"]
        total_conversions = gads_metrics["conversions"]
        overall_cpa = total_cost / total_conversions if total_conversions else 0

        summary_lines = [
            f"Impressions:       {gads_metrics['impressions']:>12,}",
            f"Clicks:            {gads_metrics['clicks']:>12,}",
            f"CTR:               {gads_metrics['ctr']:>12.2%}",
            f"Total Spend:       ${total_cost:>11,.2f}",
            f"Conversions:       {total_conversions:>12.0f}",
            f"Cost/Conversion:   {_cpa_indicator(overall_cpa, thresholds)}",
            f"Avg CPC:           ${gads_metrics['avg_cpc']:>11,.2f}",
        ]
        console.print(
            Panel(
                "\n".join(summary_lines),
                title="Performance Summary",
                border_style="cyan",
            )
        )

    # ── Campaign table ───────────────────────────────────────────────────
    if gads_campaigns:
        table = Table(
            title="Campaign Breakdown", border_style="magenta", show_lines=True
        )
        table.add_column("Campaign", style="bold", max_width=30)
        table.add_column("Impressions", justify="right")
        table.add_column("Clicks", justify="right")
        table.add_column("Conv.", justify="right")
        table.add_column("Cost", justify="right")
        table.add_column("CPA", justify="right")

        for c in gads_campaigns:
            cpa = c["cost"] / c["conversions"] if c["conversions"] else 0
            table.add_row(
                c["name"],
                f"{c['impressions']:,}",
                f"{c['clicks']:,}",
                f"{c['conversions']:.0f}",
                f"${c['cost']:,.2f}",
                _cpa_indicator(cpa, thresholds),
            )
        console.print(table)

    # ── Revenue projection ───────────────────────────────────────────────
    days_in_range = max((end_date - start_date).days, 1)
    if gads_metrics and gads_metrics["conversions"]:
        deal_size = thresholds["deal_size"]["average"]
        estimated_revenue = gads_metrics["conversions"] * deal_size
        daily_pace = estimated_revenue / days_in_range
        forecast = calc.forecast_revenue(daily_pace, 90)

        console.print(
            Panel(
                f"Estimated revenue (period):  ${estimated_revenue:,.2f}\n"
                f"Daily pace:                  ${daily_pace:,.2f}\n"
                f"90-day projection:           ${forecast['projected_revenue']:,.2f}\n"
                f"  Confidence band:           "
                f"${forecast['confidence_band']['low']:,.2f} – "
                f"${forecast['confidence_band']['high']:,.2f}",
                title="Revenue Projection",
                border_style="green",
            )
        )
    else:
        console.print("[dim]Insufficient conversion data for revenue projection.[/]")

    # ── Alerts ───────────────────────────────────────────────────────────
    alerts = []
    for c in gads_campaigns:
        cpa = c["cost"] / c["conversions"] if c["conversions"] else 0
        if cpa > thresholds["cpa"]["critical"] and c["conversions"] > 0:
            alerts.append(
                f"[red]🔴 {c['name']}: CPA ${cpa:,.2f} exceeds critical "
                f"threshold (${thresholds['cpa']['critical']})[/]"
            )
        if c["conversions"] == 0 and c["cost"] > thresholds["budget"]["zero_conversion_limit"]:
            alerts.append(
                f"[red]🔴 {c['name']}: ${c['cost']:,.2f} spent with "
                f"0 conversions[/]"
            )

    if alerts:
        console.print(
            Panel("\n".join(alerts), title="[bold red]⚠ ALERTS[/]", border_style="red")
        )


# ── serve (web dashboard) ────────────────────────────────────────────────────


@cli.command()
@click.option("--port", default=8080, help="Port to run the dashboard on")
@click.option(
    "--mode",
    default="sexy",
    type=click.Choice(["sexy", "debug"]),
    help="Dashboard mode",
)
def serve(port: int, mode: str):
    """Launch the premium web dashboard."""
    from agents.dashboard.web_app import create_app

    app = create_app()
    debug = mode == "debug"

    console.print()
    console.print(
        Panel(
            f"[bold green]🚀 Marketing Intelligence Center[/]\n\n"
            f"  Dashboard: [link=http://localhost:{port}]http://localhost:{port}[/link]\n"
            f"  Mode:      [bold]{'Development' if debug else 'Production'}[/]\n"
            f"  Theme:     [bold]Premium ({mode})[/]\n\n"
            f"  Press [bold]Ctrl+C[/] to stop",
            title="[bold white]Web Dashboard[/]",
            border_style="bright_green",
            padding=(1, 2),
        )
    )
    console.print()
    app.run(host="0.0.0.0", port=port, debug=debug)


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli()
