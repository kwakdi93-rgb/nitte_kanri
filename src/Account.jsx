import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CalendarApp from "./App.jsx";
import { api } from "./api.js";
import { Icon, Modal } from "./ui.jsx";
import "./account.css";

function Brand({ className = "account-brand" }) {
  return (
    <div className={className}>
      <span className="brand-mark">
        <Icon name="calendar" size={25} />
      </span>
      <div>
        <strong>日々の予定</strong>
        <span>わたしの、小さなカレンダー</span>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  disabled,
  autoComplete = "current-password",
  placeholder,
  required = false,
  describedBy,
  invalid = false,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="account-password-wrap">
      <input
        id={id}
        className="field-input"
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={128}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={invalid}
      />
      <button
        type="button"
        className="account-password-toggle"
        aria-label={visible ? "パスワードを隠す" : "パスワードを表示"}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
        disabled={disabled}
      >
        <Icon name={visible ? "hidden" : "eye"} size={18} />
      </button>
    </div>
  );
}

function Login({ onLogin, notice, connectionError, onRetry }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const userRef = useRef(null);
  useEffect(() => {
    document.title = "ログイン — 日々の予定";
  }, []);
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("ログインIDとパスワードを入力してください。");
      document
        .getElementById(!username.trim() ? "login-username" : "login-password")
        ?.focus();
      return;
    }
    setBusy(true);
    try {
      const user = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      onLogin(user);
    } catch (error) {
      setError(error.message);
      setBusy(false);
    }
  }
  return (
    <main className="account-screen">
      <div className="account-decoration" aria-hidden="true" />
      <div className="account-shell">
        <section className="account-intro">
          <Brand />
          <span className="account-kicker">毎日を、あなたらしく。</span>
          <h1 className="account-title">
            あなたの予定に、
            <br />
            あなただけの場所を。
          </h1>
          <p className="account-copy">
            楽しみなライブも、大切な約束も。
            <br />
            ログインして、今日からの日々を整えましょう。
          </p>
          <div className="account-features">
            <span>
              <Icon name="calendar" />
              ひと目でわかるカレンダー
            </span>
            <span>
              <Icon name="lock" />
              アカウントごとに予定を管理
            </span>
            <span>
              <Icon name="leaf" />
              自分らしい毎日を、ここから
            </span>
          </div>
        </section>
        <section className="account-card" aria-labelledby="login-title">
          <div className="account-card-header">
            <span className="account-kicker">おかえりなさい</span>
            <h2 id="login-title">ログイン</h2>
            <p>ログインIDとパスワードを入力してください。</p>
          </div>
          {notice && (
            <div className="admin-feedback" role="status">
              {notice}
            </div>
          )}
          {connectionError && (
            <div className="account-error" role="alert">
              <p>{connectionError}</p>
              <button className="text-button" onClick={onRetry}>
                再読み込み
              </button>
            </div>
          )}
          <form className="account-form" onSubmit={submit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="login-username">
                ログインID
              </label>
              <input
                ref={userRef}
                id="login-username"
                className="field-input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ログインIDを入力"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={40}
                disabled={busy}
                required
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="login-password">
                パスワード
              </label>
              <PasswordInput
                id="login-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                placeholder="パスワードを入力"
                required
              />
            </div>
            {error && (
              <div className="account-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "ログイン中…" : "ログイン"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <div className="account-demo">
            <span className="account-demo-title">初期デモアカウント</span>
            <p>アカウントを選ぶと、初期情報を入力できます。</p>
            <div className="account-demo-grid">
              {[
                ["test1", "会員1"],
                ["test2", "会員2"],
                ["administer", "管理者"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="account-demo-user"
                  disabled={busy}
                  onClick={() => {
                    setUsername(id);
                    setPassword("12345678");
                    setError("");
                    userRef.current?.focus();
                  }}
                >
                  <strong>{id}</strong>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <small>
              初期パスワード：12345678
              <br />
              管理者が変更した場合は、変更後の情報でログインしてください。
            </small>
          </div>
        </section>
        <footer className="account-footer">
          小さな予定から、心地よい毎日を。
        </footer>
      </div>
    </main>
  );
}

function MemberEditor({ member, onSave, onClose }) {
  const [form, setForm] = useState({
    name: member.name,
    username: member.username,
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const change = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };
  async function submit(event) {
    event.preventDefault();
    const next = {};
    if (!form.name.trim() || form.name.trim().length > 80)
      next.name = "名前を1〜80文字で入力してください。";
    if (!/^[A-Za-z0-9_.-]{3,40}$/.test(form.username.trim()))
      next.username =
        "ログインIDは半角英数字・記号（_ . -）を使い、3〜40文字で入力してください。";
    if (
      form.password &&
      (form.password.length < 8 || form.password.length > 128)
    )
      next.password = "パスワードは8〜128文字で入力してください。";
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(`member-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(member.id, {
        ...form,
        name: form.name.trim(),
        username: form.username.trim(),
      });
    } catch (error) {
      setError(error.message);
      setSaving(false);
    }
  }
  return (
    <Modal titleId="member-edit-title" onClose={onClose} busy={saving}>
      <div className="modal-header">
        <div>
          <span className="modal-eyebrow">会員情報</span>
          <h2 className="modal-title" id="member-edit-title">
            会員情報を編集
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="閉じる"
          disabled={saving}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <form className="event-form admin-editor" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="member-name">
            名前<span className="required-mark">必須</span>
          </label>
          <input
            className="field-input"
            id="member-name"
            value={form.name}
            onChange={(event) => change("name", event.target.value)}
            maxLength={80}
            disabled={saving}
            autoComplete="off"
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "member-name-error" : undefined}
          />
          {errors.name && (
            <span id="member-name-error" className="field-error" role="alert">
              {errors.name}
            </span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="member-username">
            ログインID<span className="required-mark">必須</span>
          </label>
          <input
            className="field-input"
            id="member-username"
            value={form.username}
            onChange={(event) => change("username", event.target.value)}
            maxLength={40}
            disabled={saving}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={Boolean(errors.username)}
            aria-describedby={
              errors.username ? "member-username-error" : undefined
            }
          />
          {errors.username && (
            <span
              id="member-username-error"
              className="field-error"
              role="alert"
            >
              {errors.username}
            </span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="member-password">
            新しいパスワード<span className="password-status">任意</span>
          </label>
          <PasswordInput
            id="member-password"
            value={form.password}
            onChange={(event) => change("password", event.target.value)}
            disabled={saving}
            autoComplete="new-password"
            placeholder="変更する場合のみ入力"
            describedBy={
              errors.password
                ? "member-password-hint member-password-error"
                : "member-password-hint"
            }
            invalid={Boolean(errors.password)}
          />
          <p id="member-password-hint" className="password-hint">
            空欄のまま保存すると、現在のパスワードを維持します。
          </p>
          {errors.password && (
            <span
              id="member-password-error"
              className="field-error"
              role="alert"
            >
              {errors.password}
            </span>
          )}
        </div>
        <p className="admin-note">
          <Icon name="lock" size={16} />
          ログインIDまたはパスワードを変更すると、この会員は再ログインが必要になります。
        </p>
        {error && (
          <div className="account-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            <Icon name="check" size={17} />
            {saving ? "保存中…" : "変更を保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Admin({ user, onLogout, logoutBusy, logoutError }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    document.title = "会員管理 — 日々の予定";
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api("/admin/users", { signal: controller.signal })
      .then((data) => {
        setMembers(data);
        setLoading(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const filtered = useMemo(
    () =>
      members.filter((member) =>
        `${member.name} ${member.username}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [members, query],
  );
  async function saveMember(id, form) {
    const saved = await api(`/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(form),
    });
    setMembers((previous) =>
      previous.map((member) => (member.id === id ? saved : member)),
    );
    setEditing(null);
    setNotice("会員情報を更新しました。");
  }
  return (
    <div className="admin-shell">
      <div inert={Boolean(editing)}>
        <header className="admin-topbar">
          <Brand className="admin-brand" />
          <div className="admin-account">
            <span className="member-role">管理者</span>
            <span>{user.name}</span>
            <button
              className="logout-button"
              onClick={onLogout}
              disabled={logoutBusy}
            >
              <Icon name="logout" size={17} />
              {logoutBusy ? "ログアウト中…" : "ログアウト"}
            </button>
          </div>
        </header>
        <main className="admin-main">
          <section className="admin-heading">
            <div>
              <span className="admin-eyebrow">管理者スペース</span>
              <h1 className="admin-title">会員管理</h1>
              <p className="admin-description">
                会員の名前・ログインID・パスワードを管理できます。
              </p>
            </div>
            <div className="admin-stat">
              <Icon name="users" size={25} />
              <span>
                <strong>{loading ? "—" : members.length}</strong>名
                <span>登録会員</span>
              </span>
            </div>
          </section>
          {logoutError && (
            <div className="account-error" role="alert">
              {logoutError}
            </div>
          )}
          {notice && (
            <div className="admin-feedback" role="status">
              <Icon name="check" size={18} />
              {notice}
            </div>
          )}
          <section
            className="admin-panel"
            aria-label="会員一覧"
            aria-busy={loading}
          >
            <div className="admin-panel-toolbar">
              <h2>
                会員一覧<span className="admin-count">{filtered.length}名</span>
              </h2>
              <div className="admin-search">
                <Icon name="search" size={18} />
                <label className="sr-only" htmlFor="member-search">
                  名前・ログインIDで検索
                </label>
                <input
                  id="member-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="名前・ログインIDで検索"
                />
              </div>
            </div>
            {error ? (
              <div className="account-error" role="alert">
                <p>{error}</p>
                <button
                  className="secondary-button"
                  onClick={() => setReload((value) => value + 1)}
                >
                  再読み込み
                </button>
              </div>
            ) : loading ? (
              <div className="account-loading" role="status">
                会員情報を読み込んでいます…
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">名前</th>
                      <th scope="col">ログインID</th>
                      <th scope="col">パスワード</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <div className="member-cell">
                            <span className="member-avatar">
                              {Array.from(member.name)[0]}
                            </span>
                            <strong className="member-name" title={member.name}>
                              {member.name}
                            </strong>
                          </div>
                        </td>
                        <td>
                          <span className="member-id" title={member.username}>
                            {member.username}
                          </span>
                        </td>
                        <td>
                          <span className="password-status">
                            <Icon name="lock" size={14} />
                            設定済み
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="member-edit"
                            aria-label={`${member.name}の情報を編集`}
                            onClick={() => {
                              setNotice("");
                              setEditing(member);
                            }}
                          >
                            <Icon name="edit" size={16} />
                            編集
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <div className="admin-empty">
                    <Icon name="search" size={24} />
                    <strong>
                      {query
                        ? "会員が見つかりません"
                        : "登録された会員はいません"}
                    </strong>
                    <p>
                      {query
                        ? "別の名前やログインIDで検索してください。"
                        : "会員が登録されると、ここに表示されます。"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
          <p className="admin-note">
            <Icon name="lock" size={17} />
            パスワードは表示されません。変更が必要な場合は、編集画面から新しく設定してください。
          </p>
          <footer className="account-footer">
            日々の予定 · 管理者スペース
          </footer>
        </main>
      </div>
      {editing && (
        <MemberEditor
          member={editing}
          onSave={saveMember}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default function AccountApp() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const sequence = useRef(0);
  const channel = useRef(null);
  const refresh = useCallback(async (background = false) => {
    const current = ++sequence.current;
    if (!background) {
      setChecking(true);
      setUser(null);
    }
    setConnectionError("");
    try {
      const member = await api("/auth/me");
      if (current === sequence.current) {
        setUser(member);
        setNotice("");
      }
    } catch (error) {
      if (current !== sequence.current) return;
      if (error.status === 401) {
        setUser(null);
      } else if (!background) setConnectionError(error.message);
    } finally {
      if (current === sequence.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const expired = () => {
      sequence.current++;
      setUser(null);
      setChecking(false);
      setNotice(
        "ログインの有効期限が切れました。もう一度ログインしてください。",
      );
      setLogoutError("");
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    window.addEventListener("hibi-session-expired", expired);
    document.addEventListener("visibilitychange", visible);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("hibi-account-session");
      channel.current.onmessage = () => refresh();
    }
    return () => {
      sequence.current++;
      window.removeEventListener("hibi-session-expired", expired);
      document.removeEventListener("visibilitychange", visible);
      channel.current?.close();
    };
  }, [refresh]);
  useEffect(() => {
    if (checking) return;
    const path = !user
      ? "/login"
      : user.role === "admin"
        ? "/admin"
        : "/calendar";
    if (window.location.pathname !== path)
      window.history.replaceState(null, "", path);
    if (user?.role === "user") document.title = "カレンダー — 日々の予定";
  }, [user, checking]);
  function login(member) {
    sequence.current++;
    setUser(member);
    setChecking(false);
    setNotice("");
    setLogoutError("");
    channel.current?.postMessage("changed");
  }
  async function logout() {
    setLogoutBusy(true);
    setLogoutError("");
    try {
      await api("/auth/logout", { method: "POST" });
      sequence.current++;
      setUser(null);
      setNotice("ログアウトしました。");
      channel.current?.postMessage("changed");
    } catch (error) {
      if (error.status === 401) {
        sequence.current++;
        setUser(null);
      } else setLogoutError(error.message);
    } finally {
      setLogoutBusy(false);
    }
  }
  if (checking)
    return (
      <main className="account-screen">
        <div className="account-loading" role="status">
          <Icon name="calendar" size={30} />
          <p>ログイン状態を確認しています…</p>
        </div>
      </main>
    );
  if (!user)
    return (
      <Login
        onLogin={login}
        notice={notice}
        connectionError={connectionError}
        onRetry={() => refresh()}
      />
    );
  const props = { user, onLogout: logout, logoutBusy, logoutError };
  return user.role === "admin" ? (
    <Admin key={user.id} {...props} />
  ) : (
    <CalendarApp key={user.id} {...props} />
  );
}
