from backend.app.manage import scan_vault


def test_plain_excalidraw_files_are_imported_without_changing_source(tmp_path):
    raw = b'{"type":"excalidraw","elements":[],"appState":{},"files":{}}\r\n'
    (tmp_path / 'Drawing.excalidraw').write_bytes(raw)
    notes = scan_vault(tmp_path, 'test', 'drawings')
    assert len(notes) == 1
    assert notes[0]['current_content'].encode() == raw
    assert notes[0]['title'] == 'Drawing.excalidraw'


def test_geogebra_binary_assets_are_published_in_manifest(tmp_path, monkeypatch):
    from backend.app import manage

    root = tmp_path / 'vault'
    root.mkdir()
    (root / 'graph.ggb').write_bytes(b'PK\x03\x04example')
    module = tmp_path / 'project/backend/app/manage.py'
    monkeypatch.setattr(manage, '__file__', str(module))
    manifest = tmp_path / 'project/frontend/src/lib'
    manifest.mkdir(parents=True)
    assert manage.copy_assets(root) == 1
    copied = tmp_path / 'project/frontend/public/vault/vault/graph.ggb'
    assert copied.read_bytes() == b'PK\x03\x04example'
    assert 'graph.ggb' in (manifest / 'vault-assets.json').read_text()
