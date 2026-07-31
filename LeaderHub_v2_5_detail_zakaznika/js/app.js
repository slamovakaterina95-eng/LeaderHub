import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const sb = createClient(
  'https://brniiebtdfjrbggyyiei.supabase.co',
  'sb_publishable_MK5VMec_VFo3gvQMvxyeQw_DpazDGyr'
);

const NAV = [
  ['dashboard','🏠 Přehled'],
  ['contacts','👥 Zákazníci'],
  ['tasks','✅ Úkoly'],
  ['demos','📅 Kalendář'],
  ['team','🌿 Tým']
];

const STATUS = ['Nový zájemce','Domluvená ukázka','Čeká na vyjádření','Klient','Nezájem'];
let contacts = [], tasks = [], demos = [], team = [], contactActivities = [];
let mode = '', editId = null, detailContactId = null;
let monthlyGoal = Math.max(1, Number(localStorage.getItem('leaderhub_monthly_goal')) || 10);

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[char]));
const fmt = value => value ? new Date(value).toLocaleDateString('cs-CZ') : '';
const monthKey = () => new Date().toISOString().slice(0,7);
const dayStart = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysBetween = (a,b) => Math.round((dayStart(a)-dayStart(b))/86400000);

function showPage(id) {
  document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === id));
  document.querySelectorAll('.section').forEach(el => el.classList.toggle('active', el.id === id));
  window.scrollTo(0,0);
}

function initNavigation() {
  $('#desktopNav').innerHTML = NAV.map((item,index) =>
    `<button data-page="${item[0]}" class="${index ? '' : 'active'}">${item[1]}</button>`
  ).join('');
  $('#mobileNav').innerHTML = $('#desktopNav').innerHTML;
  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => showPage(button.dataset.page));
  });
  document.querySelectorAll('[data-jump]').forEach(button => {
    button.addEventListener('click', () => {
      showPage(button.dataset.jump);
      if (button.dataset.filter !== undefined) {
        $('#contactFilter').value = button.dataset.filter;
        renderContacts();
      }
    });
  });
}

function authMessage(text) { $('#authMsg').textContent = text; }

async function showSession() {
  const { data: { session } } = await sb.auth.getSession();
  $('#authView').classList.toggle('hidden', Boolean(session));
  $('#appView').classList.toggle('hidden', !session);
  if (session) await loadAll();
}

$('#loginBtn').onclick = async () => {
  authMessage('Přihlašuji…');
  const { error } = await sb.auth.signInWithPassword({
    email: $('#email').value.trim(),
    password: $('#password').value
  });
  authMessage(error ? error.message : '');
  await showSession();
};

$('#signupBtn').onclick = async () => {
  authMessage('Vytvářím účet…');
  const { error } = await sb.auth.signUp({
    email: $('#email').value.trim(),
    password: $('#password').value,
    options: { emailRedirectTo: location.origin + location.pathname }
  });
  authMessage(error ? error.message : 'Účet byl vytvořen. Zkontroluj potvrzovací e-mail.');
  await showSession();
};

$('#resetBtn').onclick = async () => {
  const email = $('#email').value.trim();
  if (!email) return authMessage('Nejdřív zadej e-mail.');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname
  });
  authMessage(error ? error.message : 'Odkaz pro změnu hesla byl odeslán.');
};

$('#logoutBtn').onclick = async () => {
  await sb.auth.signOut();
  await showSession();
};

sb.auth.onAuthStateChange(() => setTimeout(showSession, 0));

async function loadAll() {
  const [c,t,d,m,a] = await Promise.all([
    sb.from('contacts').select('*').order('created_at',{ascending:false}),
    sb.from('tasks').select('*').order('due_at',{ascending:true,nullsFirst:false}),
    sb.from('demos').select('*').order('demo_date',{ascending:true}),
    sb.from('team_members').select('*').order('full_name',{ascending:true}),
    sb.from('contact_activities').select('*').order('happened_at',{ascending:false})
  ]);

  const errors = [c.error,t.error,d.error,m.error,a.error].filter(Boolean);
  $('#dbWarning').classList.toggle('hidden', !errors.length);
  $('#dbWarning').textContent = errors.length
    ? 'Některá část databáze není dostupná: ' + errors[0].message
    : '';

  contacts = c.data || [];
  tasks = t.data || [];
  demos = d.data || [];
  team = m.data || [];
  contactActivities = a.data || [];
  renderAll();
}

function renderGoal(sales) {
  const percent = Math.round((sales / monthlyGoal) * 100);
  const card = $('#goalCard');
  let className = 'goal-red';
  let message = `Do cíle zbývá ${Math.max(monthlyGoal-sales,0)} Thermomixů. 💪`;

  if (percent >= 100) {
    className = 'goal-gold';
    message = 'Cíl splněn! Skvělá práce! 🏆';
  } else if (percent >= 76) {
    className = 'goal-green';
    message = `Do cíle zbývá už jen ${monthlyGoal-sales}. 🚀`;
  } else if (percent >= 51) {
    className = 'goal-yellow';
    message = `Cíl je na dosah. Zbývá ${monthlyGoal-sales}.`;
  } else if (percent >= 26) {
    className = 'goal-orange';
    message = 'Jdeš správným směrem. Jen tak dál!';
  }

  card.className = `card goal-card ${className}`;
  $('#goalCount').textContent = `${sales} / ${monthlyGoal} Thermomixů`;
  $('#goalPercent').textContent = `${percent} %`;
  $('#goalFill').style.width = `${Math.min(percent,100)}%`;
  $('#goalMessage').textContent = message;
}

function followupState(contact) {
  if (!contact.follow_up_date) return '';
  const diff = daysBetween(new Date(contact.follow_up_date), new Date());
  if (diff < 0) return `<span class="followup-due">Po termínu ${Math.abs(diff)} d.</span>`;
  if (diff === 0) return `<span class="followup-today">Dnes</span>`;
  return `za ${diff} d.`;
}

function renderRecommendations() {
  const overdue = contacts.filter(c => c.follow_up_date && daysBetween(new Date(c.follow_up_date),new Date()) < 0);
  const waiting = contacts.filter(c => c.status === 'Čeká na vyjádření');
  const activeTasks = tasks.filter(t => !t.completed);
  const upcoming = demos.filter(d => new Date(d.demo_date) >= new Date());

  const items = [];
  if (overdue.length) items.push(['📞',`Ozvi se ${overdue.length} kontaktům`,`Mají follow-up po termínu.`]);
  if (waiting.length) items.push(['⏳',`Projdi ${waiting.length} čekajících zájemců`,`Čekají na vyjádření.`]);
  if (activeTasks.length) items.push(['✅',`Dokonči dnešní priority`,`Aktivních úkolů: ${activeTasks.length}.`]);
  if (!upcoming.length) items.push(['🏡','Naplánuj další ukázku','V kalendáři zatím není žádná budoucí událost.']);
  if (!items.length) items.push(['✨','Všechno důležité je pod kontrolou','Skvělá práce.']);

  $('#recommendations').innerHTML = items.slice(0,3).map(i =>
    `<div class="recommendation"><span>${i[0]}</span><div><b>${esc(i[1])}</b><small>${esc(i[2])}</small></div></div>`
  ).join('');
}

function renderDashboard() {
  const activeTasks = tasks.filter(item => !item.completed);
  const monthDemos = demos.filter(item => (item.demo_date || '').slice(0,7) === monthKey());
  const sales = monthDemos.reduce((sum,item) => sum + (Number(item.sale_count) || 0), 0);
  const newLeads = contacts.filter(item => item.status === 'Nový zájemce');
  const waiting = contacts.filter(item => item.status === 'Čeká na vyjádření');

  $('#statNew').textContent = newLeads.length;
  $('#statWaiting').textContent = waiting.length;
  $('#statTasks').textContent = activeTasks.length;
  $('#statDemos').textContent = monthDemos.length;
  renderGoal(sales);
  renderRecommendations();

  const followups = contacts
    .filter(item => item.follow_up_date)
    .sort((a,b) => new Date(a.follow_up_date) - new Date(b.follow_up_date))
    .slice(0,5);

  $('#dashFollowups').innerHTML = followups.map(item =>
    `<div class="item row">
      <div>
        <b>${esc(item.full_name)}</b>
        <div class="muted">${esc(item.next_step || 'Ozvat se zákazníkovi')}</div>
      </div>
      <div>${followupState(item)}</div>
    </div>`
  ).join('') || '<div class="empty">Zatím žádný naplánovaný follow-up</div>';

  const upcoming = demos
    .filter(item => new Date(item.demo_date) >= new Date())
    .slice(0,5);

  $('#dashDemos').innerHTML = upcoming.map(item =>
    `<div class="item row">
      <div><b>${esc(item.title)}</b><div class="muted">${esc(item.place || 'Místo neuvedeno')}</div></div>
      <div><b>${fmt(item.demo_date)}</b></div>
    </div>`
  ).join('') || '<div class="empty">Žádné plánované události</div>';
}

const statusClass = status =>
  status === 'Nový zájemce' ? 's-new' :
  status === 'Domluvená ukázka' ? 's-demo' :
  status === 'Čeká na vyjádření' ? 's-wait' :
  status === 'Klient' ? 's-client' : 's-no';

function renderStatusOverview() {
  const filter = $('#contactFilter').value;
  $('#contactStatusCards').innerHTML = STATUS.map(status => {
    const count = contacts.filter(item => item.status === status).length;
    return `<button class="status-chip ${filter === status ? 'active' : ''}" data-status-filter="${esc(status)}">
      <span><span class="status-dot ${statusClass(status)}"></span>${esc(status)}</span>
      <strong>${count}</strong>
    </button>`;
  }).join('');

  document.querySelectorAll('[data-status-filter]').forEach(button => {
    button.onclick = () => {
      $('#contactFilter').value = $('#contactFilter').value === button.dataset.statusFilter ? '' : button.dataset.statusFilter;
      renderContacts();
    };
  });
}

function renderContacts() {
  renderStatusOverview();
  const search = $('#contactSearch').value.toLowerCase();
  const filter = $('#contactFilter').value;
  const filtered = contacts.filter(item =>
    ((item.full_name || '') + (item.phone || '') + (item.email || '')).toLowerCase().includes(search)
    && (!filter || item.status === filter)
  );

  $('#contactsList').innerHTML = filtered.map(item =>
    `<div class="item row">
      <div>
        <b class="contact-name">${esc(item.full_name)}</b>
        <div class="contact-meta">
          ${item.phone ? `<span>📞 ${esc(item.phone)}</span>` : ''}
          ${item.email ? `<span>✉️ ${esc(item.email)}</span>` : ''}
          ${item.city ? `<span>📍 ${esc(item.city)}</span>` : ''}
        </div>
        <span class="pill"><span class="status-dot ${statusClass(item.status)}"></span>${esc(item.status || 'Nový zájemce')}</span>
        ${item.next_step ? `<span class="pill">Další krok: ${esc(item.next_step)}</span>` : ''}
        ${item.follow_up_date ? `<div class="muted" style="margin-top:8px">Follow-up: ${fmt(item.follow_up_date)} · ${followupState(item)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="primary" onclick="openContactDetail('${item.id}')">Otevřít kartu</button>
        ${item.phone ? `<a class="secondary call-link" href="tel:${esc(item.phone)}">Zavolat</a>` : ''}
        <button class="danger" onclick="removeRow('contacts','${item.id}')">Smazat</button>
      </div>
    </div>`
  ).join('') || '<div class="empty">V tomto filtru zatím nejsou žádní zákazníci</div>';
}

function taskTiming(task) {
  if (!task.due_at) return '';
  const diff = daysBetween(new Date(task.due_at), new Date());
  if (diff < 0) return `<span class="followup-due">Po termínu</span>`;
  if (diff === 0) return `<span class="followup-today">Dnes</span>`;
  return fmt(task.due_at);
}

function renderTasks() {
  $('#tasksList').innerHTML = tasks.map(item =>
    `<div class="item row">
      <div>
        <label>
          <input style="width:auto" type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleTask('${item.id}',this.checked)">
          <b style="${item.completed ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(item.title)}</b>
        </label>
        <div class="muted">${taskTiming(item)} ${item.priority ? '· ' + esc(item.priority) : ''}</div>
      </div>
      <div class="actions">
        <button class="secondary" onclick="openTask('${item.id}')">Upravit</button>
        <button class="danger" onclick="removeRow('tasks','${item.id}')">Smazat</button>
      </div>
    </div>`
  ).join('') || '<div class="empty">Zatím žádné úkoly</div>';
}

function renderDemos() {
  $('#demosList').innerHTML = demos.map(item =>
    `<div class="item row">
      <div>
        <b>${esc(item.title)}</b>
        <div class="muted">${fmt(item.demo_date)} · ${esc(item.place || 'Místo neuvedeno')}</div>
        <span class="pill">${esc(item.result || 'Plánovaná')}</span>
        <span class="pill">Prodeje: ${Number(item.sale_count) || 0}</span>
      </div>
      <div class="actions">
        <button class="secondary" onclick="openDemo('${item.id}')">Upravit</button>
        <button class="danger" onclick="removeRow('demos','${item.id}')">Smazat</button>
      </div>
    </div>`
  ).join('') || '<div class="empty">Zatím žádné události</div>';
}

function renderTeam() {
  $('#teamList').innerHTML = team.map(item => {
    const goal = Number(item.monthly_goal) || 0;
    const sales = Number(item.monthly_sales) || 0;
    const percent = goal ? Math.round(sales / goal * 100) : 0;
    const color = percent >= 100 ? 'goal-gold' : percent >= 76 ? 'goal-green' : percent >= 51 ? 'goal-yellow' : percent >= 26 ? 'goal-orange' : 'goal-red';
    return `<div class="item row">
      <div>
        <b>${esc(item.full_name)}</b>
        <div class="muted">${esc(item.phone || '')} ${item.email ? '· ' + esc(item.email) : ''}</div>
        <span class="pill">Cíl: ${goal}</span>
        <span class="pill">Prodeje: ${sales}</span>
        <span class="pill ${color}">${percent} %</span>
      </div>
      <div class="actions">
        <button class="secondary" onclick="openMember('${item.id}')">Upravit</button>
        <button class="danger" onclick="removeRow('team_members','${item.id}')">Smazat</button>
      </div>
    </div>`;
  }).join('') || '<div class="empty">Zatím žádní členové týmu</div>';
}

function renderAll() {
  renderDashboard();
  renderContacts();
  renderTasks();
  renderDemos();
  renderTeam();
}

$('#goalInput').value = monthlyGoal;
$('#saveGoalBtn').onclick = () => {
  monthlyGoal = Math.max(1, Number($('#goalInput').value) || 1);
  localStorage.setItem('leaderhub_monthly_goal', String(monthlyGoal));
  renderDashboard();
};

$('#contactSearch').oninput = renderContacts;
$('#contactFilter').onchange = renderContacts;

$('#quickAddBtn').onclick = event => {
  event.stopPropagation();
  $('#quickMenu').classList.toggle('open');
};
window.closeQuickMenu = () => $('#quickMenu').classList.remove('open');
document.addEventListener('click', event => {
  if (!$('#quickMenu').contains(event.target) && event.target !== $('#quickAddBtn')) closeQuickMenu();
});


function activityIcon(type) {
  return type === 'Telefonát' ? '📞' :
    type === 'SMS' ? '💬' :
    type === 'E-mail' ? '✉️' :
    type === 'Ukázka' ? '🏡' :
    type === 'Poznámka' ? '📝' : '•';
}

function renderContactDetail() {
  const contact = contacts.find(item => item.id === detailContactId);
  if (!contact) return;

  $('#detailName').textContent = contact.full_name || 'Zákazník';
  $('#detailHeader').innerHTML = `
    <span class="pill"><span class="status-dot ${statusClass(contact.status)}"></span>${esc(contact.status || 'Nový zájemce')}</span>
    <div class="detail-contact">
      ${contact.phone ? `<a href="tel:${esc(contact.phone)}">📞 ${esc(contact.phone)}</a>` : '<span class="muted">Telefon neuveden</span>'}
      ${contact.email ? `<a href="mailto:${esc(contact.email)}">✉️ ${esc(contact.email)}</a>` : ''}
    </div>`;

  $('#detailOverview').innerHTML = `
    <div class="detail-grid">
      <div class="detail-card"><div class="label">STAV</div><strong>${esc(contact.status || 'Nový zájemce')}</strong></div>
      <div class="detail-card"><div class="label">TYP KONTAKTU</div><strong>${esc(contact.contact_type || 'Zájemce')}</strong></div>
      <div class="detail-card"><div class="label">MĚSTO</div><strong>${esc(contact.city || 'Neuvedeno')}</strong></div>
      <div class="detail-card"><div class="label">DALŠÍ KONTAKT</div><strong>${contact.follow_up_date ? fmt(contact.follow_up_date) : 'Nenaplánován'}</strong></div>
      <div class="detail-card full"><div class="label">DALŠÍ KROK</div><strong>${esc(contact.next_step || 'Není zadaný')}</strong></div>
    </div>`;

  $('#detailNotes').innerHTML = `<div class="note-box">${esc(contact.notes || 'U tohoto zákazníka zatím není žádná poznámka.')}</div>`;

  const activities = contactActivities.filter(item => item.contact_id === contact.id);
  $('#activityTimeline').innerHTML = activities.map(item => `
    <div class="timeline-item">
      <div class="activity-type">${activityIcon(item.activity_type)} ${esc(item.activity_type)}</div>
      <div>${esc(item.content || 'Bez poznámky')}</div>
      <div class="time">${new Date(item.happened_at).toLocaleString('cs-CZ')}</div>
    </div>
  `).join('') || '<div class="empty">Zatím žádná historie. Přidej první telefonát, SMS nebo poznámku.</div>';
}

window.openContactDetail = id => {
  detailContactId = id;
  renderContactDetail();
  $('#contactDetailModal').classList.add('open');
};

window.closeContactDetail = () => {
  $('#contactDetailModal').classList.remove('open');
  detailContactId = null;
};

window.editCurrentContact = () => {
  const id = detailContactId;
  closeContactDetail();
  openForm('contact', id);
};

document.querySelectorAll('[data-detail-tab]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-detail-tab]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.detail-panel').forEach(panel => panel.classList.toggle('active', panel.id === `detail-${button.dataset.detailTab}`));
  });
});

$('#saveActivityBtn').onclick = async () => {
  if (!detailContactId) return;
  const content = $('#activityContent').value.trim();
  if (!content) return alert('Napiš krátce, co se stalo.');

  const { error } = await sb.from('contact_activities').insert({
    contact_id: detailContactId,
    activity_type: $('#activityType').value,
    content,
    happened_at: new Date().toISOString()
  });

  if (error) return alert(error.message);
  $('#activityContent').value = '';
  const { data, error: loadError } = await sb.from('contact_activities').select('*').order('happened_at',{ascending:false});
  if (loadError) return alert(loadError.message);
  contactActivities = data || [];
  renderContactDetail();
};

window.openContact = id => openForm('contact',id);
window.openTask = id => openForm('task',id);
window.openDemo = id => openForm('demo',id);
window.openMember = id => openForm('member',id);

function openForm(type,id) {
  mode = type;
  editId = id || null;
  const source = type === 'contact' ? contacts : type === 'task' ? tasks : type === 'demo' ? demos : team;
  const record = source.find(item => item.id === id) || {};
  $('#modalTitle').textContent = (id ? 'Upravit ' : 'Přidat ') + (
    type === 'contact' ? 'zákazníka' :
    type === 'task' ? 'úkol' :
    type === 'demo' ? 'událost' : 'člena týmu'
  );
  $('#modalFields').innerHTML = fields(type,record);
  $('#modal').classList.add('open');
}

function fields(type,record) {
  if (type === 'contact') return `
    <div><label>Jméno</label><input name="full_name" required value="${esc(record.full_name)}"></div>
    <div><label>Telefon</label><input name="phone" value="${esc(record.phone)}"></div>
    <div><label>E-mail</label><input name="email" type="email" value="${esc(record.email)}"></div>
    <div><label>Stav</label><select name="status">${STATUS.map(value => `<option ${record.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
    <div><label>Typ kontaktu</label><select name="contact_type">${['Zájemce','Klient','Hostitelka','Doporučení','Jiné'].map(value => `<option ${record.contact_type === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
    <div><label>Město</label><input name="city" value="${esc(record.city)}"></div>
    <div><label>Další kontakt</label><input name="follow_up_date" type="date" value="${esc(record.follow_up_date)}"></div>
    <div><label>Další krok</label><input name="next_step" placeholder="Např. zavolat nebo poslat nabídku" value="${esc(record.next_step)}"></div>
    <div class="full"><label>Poznámka</label><textarea name="notes">${esc(record.notes)}</textarea></div>`;

  if (type === 'task') return `
    <div class="full"><label>Název úkolu</label><input name="title" required value="${esc(record.title)}"></div>
    <div><label>Termín</label><input name="due_at" type="datetime-local" value="${record.due_at ? record.due_at.slice(0,16) : ''}"></div>
    <div><label>Priorita</label><select name="priority">${['Nízká','Normální','Vysoká'].map(value => `<option ${record.priority === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
    <div><label><input style="width:auto" name="completed" type="checkbox" ${record.completed ? 'checked' : ''}> Hotovo</label></div>
    <div class="full"><label>Poznámka</label><textarea name="notes">${esc(record.notes)}</textarea></div>`;

  if (type === 'demo') return `
    <div class="full"><label>Název události</label><input name="title" required value="${esc(record.title || 'Ukázka Thermomixu')}"></div>
    <div><label>Datum a čas</label><input name="demo_date" type="datetime-local" required value="${record.demo_date ? record.demo_date.slice(0,16) : ''}"></div>
    <div><label>Místo</label><input name="place" value="${esc(record.place)}"></div>
    <div><label>Výsledek</label><select name="result">${['Plánovaná','Proběhla','Zrušená','Přesunutá'].map(value => `<option ${record.result === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
    <div><label>Počet hostů</label><input name="attendees" type="number" min="0" value="${Number(record.attendees) || 1}"></div>
    <div><label>Počet prodejů</label><input name="sale_count" type="number" min="0" value="${Number(record.sale_count) || 0}"></div>
    <div class="full"><label>Poznámka</label><textarea name="notes">${esc(record.notes)}</textarea></div>`;

  return `
    <div><label>Jméno</label><input name="full_name" required value="${esc(record.full_name)}"></div>
    <div><label>Telefon</label><input name="phone" value="${esc(record.phone)}"></div>
    <div><label>E-mail</label><input name="email" type="email" value="${esc(record.email)}"></div>
    <div><label>Role</label><input name="role" value="${esc(record.role || 'Poradce')}"></div>
    <div><label>Měsíční cíl</label><input name="monthly_goal" type="number" min="0" value="${Number(record.monthly_goal) || 0}"></div>
    <div><label>Prodeje tento měsíc</label><input name="monthly_sales" type="number" min="0" value="${Number(record.monthly_sales) || 0}"></div>
    <div class="full"><label>Poznámka</label><textarea name="notes">${esc(record.notes)}</textarea></div>`;
}

window.closeModal = () => $('#modal').classList.remove('open');

$('#modalForm').onsubmit = async event => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const table = mode === 'contact' ? 'contacts' : mode === 'task' ? 'tasks' : mode === 'demo' ? 'demos' : 'team_members';
  const object = Object.fromEntries(formData.entries());

  if (mode === 'task') {
    object.completed = formData.has('completed');
    object.due_at = object.due_at ? new Date(object.due_at).toISOString() : null;
  }
  if (mode === 'demo') {
    object.demo_date = new Date(object.demo_date).toISOString();
    object.attendees = Number(object.attendees || 0);
    object.sale_count = Number(object.sale_count || 0);
  }
  if (mode === 'member') {
    object.monthly_goal = Number(object.monthly_goal || 0);
    object.monthly_sales = Number(object.monthly_sales || 0);
  }

  const query = editId
    ? sb.from(table).update(object).eq('id',editId)
    : sb.from(table).insert(object);

  const { error } = await query;
  if (error) return alert(error.message);
  closeModal();
  await loadAll();
};

window.removeRow = async (table,id) => {
  if (!confirm('Opravdu smazat?')) return;
  const { error } = await sb.from(table).delete().eq('id',id);
  if (error) alert(error.message);
  else await loadAll();
};

window.toggleTask = async (id,value) => {
  const { error } = await sb.from('tasks').update({completed:value}).eq('id',id);
  if (error) alert(error.message);
  else await loadAll();
};

$('#today').textContent = new Date().toLocaleDateString('cs-CZ',{
  weekday:'long',day:'numeric',month:'long',year:'numeric'
});

initNavigation();
await showSession();
