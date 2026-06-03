import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', new_password_confirmation: '' });
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        auto_pay: !!user.auto_pay,
        auto_pay_delay_hours: Number.isFinite(user.auto_pay_delay_hours) ? user.auto_pay_delay_hours : 0,
      });
    }
  }, [user?.id]);

  const toggleAutoPay = async (next) => {
    setProfileForm(f => ({ ...f, auto_pay: next }));
    try {
      await api.put('/profile', { auto_pay: next });
      await reloadMe();
    } catch (err) {
      alert(err.response?.data?.message || 'Error updating auto-pay');
      setProfileForm(f => ({ ...f, auto_pay: !next }));
    }
  };

  const saveDelayHours = async (next) => {
    const clamped = Math.max(0, Math.min(72, Math.floor(Number(next) || 0)));
    const prev = profileForm.auto_pay_delay_hours ?? 0;
    setProfileForm(f => ({ ...f, auto_pay_delay_hours: clamped }));
    try {
      await api.put('/profile', { auto_pay_delay_hours: clamped });
      await reloadMe();
    } catch (err) {
      alert(err.response?.data?.message || 'Error updating delay');
      setProfileForm(f => ({ ...f, auto_pay_delay_hours: prev }));
    }
  };

  const reloadMe = async () => {
    try {
      const res = await api.get('/me');
      setUser(res.data.user);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    } catch {}
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put('/profile', profileForm);
      await reloadMe();
      alert('Profile updated');
    } catch (err) {
      alert(err.response?.data?.message || JSON.stringify(err.response?.data?.errors) || 'Error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.new_password_confirmation) {
      alert('New passwords do not match');
      return;
    }
    setSavingPw(true);
    try {
      await api.post('/change-password', pwForm);
      setPwForm({ current_password: '', new_password: '', new_password_confirmation: '' });
      alert('Password changed');
    } catch (err) {
      alert(err.response?.data?.message || JSON.stringify(err.response?.data?.errors) || 'Error');
    } finally {
      setSavingPw(false);
    }
  };

  const handleShowApiKey = async () => {
    if (apiKey && showApiKey) {
      setShowApiKey(false);
      return;
    }
    try {
      const res = await api.get('/me/api-key');
      setApiKey(res.data.api_key);
      setShowApiKey(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    }
  };

  const handleRegenApiKey = async () => {
    if (!confirm('Regenerate API key? Existing integrations using the old key will stop working.')) return;
    try {
      const res = await api.post('/me/regenerate-api-key');
      setApiKey(res.data.api_key);
      setShowApiKey(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    }
  };

  const handleLogoutAll = async () => {
    if (!confirm('Log out of all sessions on every device?')) return;
    try {
      await api.post('/logout-all');
      await logout();
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    }
  };

  if (!user) return <div className="p-6 text-neutral-400">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-neutral-800">Profile</h2>
        <p className="text-xs text-neutral-500 mt-1">Manage your account info, password, and API key.</p>
      </div>

      {/* Account snapshot */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Stat label="Role" value={user.role?.name || '-'} />
        <Stat label="Tier" value={user.tier?.name || '-'} />
        <Stat label="Wallet" value={`$${user.wallet ?? 0}`} tone="text-green-600" />
        <Stat label="Convert" value={user.convert ? 'On' : 'Off'} tone={user.convert ? 'text-blue-600' : 'text-neutral-400'} />
      </div>

      {/* Edit profile */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700">Edit profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500">Name</label>
            <input
              value={profileForm.name}
              onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
              required
              className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-neutral-800 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Email</label>
            <input
              type="email"
              value={profileForm.email}
              onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
              required
              className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-neutral-800 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={savingProfile}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg"
        >{savingProfile ? 'Saving…' : 'Save changes'}</button>
      </form>

      {/* Auto-pay toggle */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">🤖 Auto-pay</h3>
        <p className="text-xs text-neutral-500">
          Khi bật, hệ thống sẽ tự pay các đơn unpaid của bạn theo thứ tự
          (cũ nhất trước) bằng số dư ví — chạy mỗi phút. Khi ví không đủ
          cho đơn tiếp theo, auto-pay dừng và đợi bạn nạp thêm.
        </p>
        <label className="inline-flex items-center gap-3 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!profileForm.auto_pay}
            onChange={e => toggleAutoPay(e.target.checked)}
            className="w-5 h-5 accent-emerald-500"
          />
          <span className="text-sm text-neutral-700">
            Tự động pay đơn unpaid khi ví có tiền
            {profileForm.auto_pay
              ? <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">ON</span>
              : <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">OFF</span>}
          </span>
        </label>

        {profileForm.auto_pay && (
          <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2">
            <div className="text-xs text-neutral-600">
              Trễ <b>bao lâu</b> kể từ khi đơn tạo thì mới auto-pay
              <span className="text-neutral-400"> — cho bạn cửa sổ edit/huỷ trước khi tiền rời ví.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[0, 1, 2, 3, 4].map(h => {
                const active = (profileForm.auto_pay_delay_hours ?? 0) === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => saveDelayHours(h)}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-white border-neutral-200 text-neutral-700 hover:border-emerald-300'
                    }`}
                  >
                    {h === 0 ? 'Ngay' : `${h}h`}
                  </button>
                );
              })}
              <label className="text-xs text-neutral-500 ml-2">Custom:</label>
              <input
                type="number"
                min="0"
                max="72"
                value={profileForm.auto_pay_delay_hours ?? 0}
                onChange={e => setProfileForm(f => ({ ...f, auto_pay_delay_hours: e.target.value }))}
                onBlur={e => saveDelayHours(e.target.value)}
                className="w-20 px-2 py-1 bg-[#faf8f6] border border-neutral-200 rounded text-xs"
              />
              <span className="text-xs text-neutral-400">giờ (0-72)</span>
            </div>
          </div>
        )}
      </div>

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700">Change password</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-neutral-500">Current password</label>
            <input
              type="password"
              value={pwForm.current_password}
              onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))}
              required
              className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-neutral-800 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">New password</label>
            <input
              type="password"
              value={pwForm.new_password}
              onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))}
              minLength={6}
              required
              className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-neutral-800 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Confirm new</label>
            <input
              type="password"
              value={pwForm.new_password_confirmation}
              onChange={e => setPwForm(f => ({ ...f, new_password_confirmation: e.target.value }))}
              minLength={6}
              required
              className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-neutral-800 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={savingPw}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg"
        >{savingPw ? 'Saving…' : 'Update password'}</button>
      </form>

      {/* API Key */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700">API key</h3>
        <p className="text-xs text-neutral-500">Use this key in the <span className="font-mono">X-API-KEY</span> header to fulfill orders externally via <span className="font-mono">POST /api/fulfill</span>.</p>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={handleShowApiKey} className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm rounded-lg">
            {showApiKey ? 'Hide' : 'Show key'}
          </button>
          <button onClick={handleRegenApiKey} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm rounded-lg">
            Regenerate
          </button>
          {showApiKey && apiKey && (
            <code className="text-xs px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg font-mono break-all">{apiKey}</code>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700">Sessions</h3>
        <p className="text-xs text-neutral-500">Sign out of every device — useful if you suspect your token is compromised.</p>
        <button onClick={handleLogoutAll} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-500 text-sm rounded-lg">
          Logout all sessions
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-base font-semibold ${tone || 'text-neutral-800'}`}>{value}</div>
    </div>
  );
}
