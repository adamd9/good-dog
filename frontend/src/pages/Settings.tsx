import React, { useEffect, useState } from 'react';
import { getConfig, updateConfig, getDetectors, updateDetector, reprocessDetector } from '../api/client';
import type { AppConfig, Detector } from '../types';

const Settings: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [detectors, setDetectors] = useState<Detector[]>([]);
  const [detectorsLoading, setDetectorsLoading] = useState(true);
  const [detectorsError, setDetectorsError] = useState<string | null>(null);
  const [detectorMsgs, setDetectorMsgs] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Partial<AppConfig>>({});

  useEffect(() => {
    getConfig()
      .then((c) => { setConfig(c); setForm(c); setConfigError(null); })
      .catch((e: unknown) => setConfigError(e instanceof Error ? e.message : 'Failed to load config'))
      .finally(() => setConfigLoading(false));

    getDetectors()
      .then((d) => { setDetectors(d); setDetectorsError(null); })
      .catch((e: unknown) => setDetectorsError(e instanceof Error ? e.message : 'Failed to load detectors'))
      .finally(() => setDetectorsLoading(false));
  }, []);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setConfigSaved(false);
    updateConfig(form)
      .then((c) => { setConfig(c); setForm(c); setConfigSaved(true); setTimeout(() => setConfigSaved(false), 3000); })
      .catch((e: unknown) => setConfigError(e instanceof Error ? e.message : 'Save failed'))
      .finally(() => setSaving(false));
  };

  const setMsg = (id: string, msg: string) => {
    setDetectorMsgs((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => setDetectorMsgs((prev) => { const n = { ...prev }; delete n[id]; return n; }), 3000);
  };

  const handleDetectorThreshold = (det: Detector, value: number) => {
    updateDetector(det.id, { ...det.config, threshold: value })
      .then((updated) => {
        setDetectors((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setMsg(det.id, 'Saved.');
      })
      .catch((e: unknown) => setMsg(det.id, `Error: ${e instanceof Error ? e.message : 'Failed'}`));
  };

  const handleReprocess = (det: Detector) => {
    reprocessDetector(det.id)
      .then(() => setMsg(det.id, 'Reprocess started.'))
      .catch((e: unknown) => setMsg(det.id, `Error: ${e instanceof Error ? e.message : 'Failed'}`));
  };

  return (
    <div className="page settings">
      <h1 className="page__title">Settings</h1>

      {/* Detection & Recording Settings */}
      <section className="settings__section" aria-labelledby="settings-detection">
        <h2 id="settings-detection" className="section-heading">Detection &amp; Recording</h2>
        {configLoading && <p className="loading">Loading config…</p>}
        {configError && <p className="error-msg" role="alert">⚠ {configError}</p>}

        {config && (
          <form className="settings__form" onSubmit={handleSaveConfig}>
            <fieldset>
              <legend>Detection Settings</legend>
              <div className="form-group">
                <label htmlFor="cfg-threshold">
                  Default Threshold: {(form.detectorThreshold ?? config.detectorThreshold).toFixed(2)}
                </label>
                <input
                  id="cfg-threshold"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.detectorThreshold ?? config.detectorThreshold}
                  onChange={(e) => setForm((f) => ({ ...f, detectorThreshold: Number(e.target.value) }))}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend>Recording Settings</legend>
              <div className="form-group">
                <label htmlFor="cfg-prebuffer">Pre-buffer Seconds</label>
                <input
                  id="cfg-prebuffer"
                  type="number"
                  min={0}
                  max={30}
                  value={form.preBufferSeconds ?? config.preBufferSeconds}
                  onChange={(e) => setForm((f) => ({ ...f, preBufferSeconds: Number(e.target.value) }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cfg-postbuffer">Post-buffer Seconds</label>
                <input
                  id="cfg-postbuffer"
                  type="number"
                  min={0}
                  max={30}
                  value={form.postBufferSeconds ?? config.postBufferSeconds}
                  onChange={(e) => setForm((f) => ({ ...f, postBufferSeconds: Number(e.target.value) }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cfg-retention">Retention Days</label>
                <input
                  id="cfg-retention"
                  type="number"
                  min={1}
                  max={365}
                  value={form.retentionDays ?? config.retentionDays}
                  onChange={(e) => setForm((f) => ({ ...f, retentionDays: Number(e.target.value) }))}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend>Notifications</legend>
              <div className="form-group">
                <label htmlFor="cfg-webhook">Webhook URL</label>
                <input
                  id="cfg-webhook"
                  type="url"
                  placeholder="https://hooks.example.com/…"
                  value={form.webhookUrl ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cfg-email">Email Address</label>
                <input
                  id="cfg-email"
                  type="email"
                  placeholder="alert@example.com"
                  value={form.emailAddress ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, emailAddress: e.target.value }))}
                />
              </div>
            </fieldset>

            <div className="settings__save-row">
              <button className="btn btn--primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
              {configSaved && (
                <span className="settings__saved-msg" role="status">✓ Saved!</span>
              )}
            </div>
          </form>
        )}
      </section>

      {/* Detector List */}
      <section className="settings__section" aria-labelledby="settings-detectors">
        <h2 id="settings-detectors" className="section-heading">Detectors</h2>
        {detectorsLoading && <p className="loading">Loading detectors…</p>}
        {detectorsError && <p className="error-msg" role="alert">⚠ {detectorsError}</p>}

        {!detectorsLoading && !detectorsError && detectors.length === 0 && (
          <p className="empty-msg">No detectors configured.</p>
        )}

        <ul className="detector-list">
          {detectors.map((det) => (
            <li key={det.id} className="detector-item">
              <div className="detector-item__header">
                <span className="detector-item__name">{det.name}</span>
                <span className="detector-item__type badge badge--info">{det.type}</span>
                <span className={`badge ${det.enabled ? 'badge--success' : 'badge--danger'}`}>
                  {det.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="detector-item__controls">
                <div className="form-group form-group--inline">
                  <label htmlFor={`det-threshold-${det.id}`}>
                    Threshold: {det.config.threshold.toFixed(2)}
                  </label>
                  <input
                    id={`det-threshold-${det.id}`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    defaultValue={det.config.threshold}
                    onMouseUp={(e) => handleDetectorThreshold(det, Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => handleDetectorThreshold(det, Number((e.target as HTMLInputElement).value))}
                  />
                </div>

                <button
                  className="btn btn--sm"
                  onClick={() => handleReprocess(det)}
                  type="button"
                >
                  🔄 Reprocess all events
                </button>
              </div>

              {detectorMsgs[det.id] && (
                <p className="detector-item__msg" role="status">{detectorMsgs[det.id]}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default Settings;
