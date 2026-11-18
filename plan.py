"""One command for everything:   python plan.py <messages.txt>

The first pack builds a plan; later single messages update it. State lives in Postgres.
The printed trace is also saved to out/final_plan_and_trace.txt."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import db, pipeline  # noqa: E402
from app.config import settings  # noqa: E402


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python plan.py <messages.txt>")
    path = Path(sys.argv[1])
    db.init_db()
    res = pipeline.ingest(path.read_text(encoding="utf-8-sig"), path.name)
    out = pipeline.render_text(pipeline.get_state())
    settings.out_dir.mkdir(exist_ok=True)
    (settings.out_dir / "final_plan_and_trace.txt").write_text(out, encoding="utf-8")
    print(out)
    print(f"\n[{res['kind']} run {res['run_id']}: {res['outcome']} in {res['duration_ms'] / 1000:.1f}s] {res['summary']}")


if __name__ == "__main__":
    main()
