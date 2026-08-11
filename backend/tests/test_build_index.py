from pathlib import Path

from src.build_index import read_mapping


def test_read_mapping_uses_original_frame_id(tmp_path: Path) -> None:
    mapping = tmp_path / "video.csv"
    mapping.write_text(
        "n,pts_time,fps,frame_idx\n1,0.0,30.0,0\n2,3.0,30.0,90\n",
        encoding="utf-8",
    )

    rows = read_mapping(mapping)

    assert rows[1]["keyframeIndex"] == 2
    assert rows[1]["frameId"] == 90
    assert rows[1]["timestamp"] == 3.0

