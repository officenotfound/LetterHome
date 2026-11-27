# The fax order page, laid out like the letter order page (/send): progress bar, price bar, three step panels and a
# page-by-page preview before payment. Used by scripts/build-fax-pages-2026-11.py, which also pulls the letter page's
# own styles from public/send.html so the two always look the same.
import html, json, re

def send_styles():
    s = open('public/send.html', encoding='utf-8').read()
    head = s[:s.index('</head>')]
    style = head[head.index('<style>'):head.index('</style>') + len('</style>')]
    links = ''.join(re.findall(r'<link rel="stylesheet" href="/(?:theme|redesign|inner|country-order)\.css[^"]*">', head))
    fx = ('<style>.fx-choice input[type="radio"]{appearance:none;-webkit-appearance:none;width:18px;height:18px;min-width:18px;flex:0 0 18px;padding:0;'
          'margin:3px 0 0;border:1.5px solid var(--ink);border-radius:50% !important;background:transparent;box-shadow:none;cursor:pointer;transition:border-color .15s,box-shadow .15s}'
          '.fx-choice input[type="radio"]:hover:not(:checked){border-color:var(--red)}'
          '.fx-choice input[type="radio"]:checked{border-color:var(--red);background:transparent;box-shadow:inset 0 0 0 4px var(--paper),inset 0 0 0 9px var(--red)}'
          '.fx-choice input[type="radio"]:focus-visible{outline:2px solid var(--red);outline-offset:2px}'
          '.fx-choice:has(input:checked){border-color:var(--ink)!important}</style>')
    return style + '\n' + links + '\n' + fx + '\n'

def order_page(t, u):
    e = html.escape
    span = lambda k, v: f'<span data-fx="{k}">{v}</span>'
    fill = lambda s: s.format(base=span('base', t['base']), page=span('page', t['page']), incl=span('incl', '10'), cur=t['cur'])
    step = lambda n: e(u['step'].format(n=n))
    circle = lambda n, label, last=False: f'''      <div class="progress-step">
        <div class="progress-step-row">
          <div class="step-circle{' active' if n == 1 else ''}" id="circle-{n}">{n}</div>
          <div class="step-line" id="line-{n}"{' style="opacity:0"' if last else ''}></div>
        </div>
        <div class="step-label{' active' if n == 1 else ''}" id="label-{n}">{e(label)}</div>
      </div>'''
    field = lambda id_, label, kind='text', hint='', auto='off', extra='': (
        f'<div class="form-group"><label for="{id_}">{e(label)}</label>' + (f'<span class="field-note hint">{e(hint)}</span>' if hint else '') +
        (f'<textarea id="{id_}" name="{id_.replace("-", "_")}" maxlength="2000" {extra}></textarea>' if kind == 'textarea'
         else f'<input id="{id_}" name="{id_.replace("-", "_")}" type="{kind}" autocomplete="{auto}" {extra}>') + '</div>')
    choice = lambda val, title, sub, checked: f'''<label class="fx-choice" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid rgba(42,42,42,0.15);border-radius:2px;margin-bottom:10px;cursor:pointer">
        <input type="radio" name="fx-cover" value="{val}" style="margin-top:3px"{' checked' if checked else ''}>
        <span><span style="display:block;font-weight:600">{e(title)}</span><span style="display:block;font-size:12px;color:var(--ink-muted)">{e(sub)}</span></span>
      </label>'''
    steps_info = ''.join(f'<li><div><strong>{e(a)}</strong><p>{e(b)}</p></div></li>' for a, b in t['steps'])
    faq = ''.join(f'<div class="faq-item"><p class="faq-q">{e(q)}</p><p class="faq-a">{e(a)}</p></div>' for q, a in t['faq'])
    js = json.dumps({**t['js'], **{k: u[k] for k in ('need_agree', 'need_to', 'need_doc', 'too_many', 'too_big', 'bad_type', 'remove', 'prev_wait', 'prev_fail', 'yes', 'no', 'total_sub', 'pay')}}, ensure_ascii=False)
    return f'''<div class="progress-wrap" id="main-content" role="group" aria-label="{e(u['step'].format(n=1))}">
  <div class="progress-inner">
    <div class="progress-steps">
{circle(1, u['s1'])}
{circle(2, u['s2'])}
{circle(3, u['s3'], True)}
    </div>
  </div>
</div>

<div class="send-wrap">
  <h1 class="sr-only">{e(t['h1'])}</h1>

  <div class="total-bar" role="status">
    <span><strong>{span('base', t['base'])} {t['cur']}</strong> {e(u['total_to'])}</span>
    <span class="tb-sub">{fill(e(u['total_sub']))}</span>
  </div>

  <div class="panel" id="fx-closed" style="display:none"><h2 class="panel-title serif">{e(t['closed_h'])}</h2><p class="panel-sub">{t['closed_p']}</p></div>

  <form id="fx-form" novalidate>
  <input type="hidden" name="site" value="{t['site']}"><input type="hidden" name="lang" value="{t['lang']}">

  <div class="panel active" id="panel-1">
    <div class="eyebrow">{step(1)}</div>
    <h2 class="panel-title serif">{e(u['p1_t'])}</h2>
    <p class="panel-sub">{e(u['p1_s'])}</p>
    {field('fx-to', t['l_to'], 'tel', t['h_to'], 'off', 'inputmode="tel" style="max-width:320px"')}
    <div class="attach-zone" id="fx-zone" role="button" tabindex="0">
      <div class="attach-icon">📎</div>
      <p><strong>{e(u['att_t'])}</strong><span>{e(u['att_s'])}</span></p>
      <p style="font-size:12px;margin-top:4px">{e(u['att_n'])}</p>
      <input type="file" id="fx-files" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple style="display:none">
    </div>
    <ul class="attach-list" id="fx-list"></ul>
    <p class="field-note" id="fx-err-1" role="alert" style="color:var(--red)"></p>
    <div class="panel-nav">
      <span></span>
      <button type="button" class="btn btn-red btn-large" id="fx-next-1">{e(u['cont'])}</button>
    </div>
  </div>

  <div class="panel" id="panel-2">
    <div class="eyebrow">{step(2)}</div>
    <h2 class="panel-title serif">{e(u['p2_t'])}</h2>
    <p class="panel-sub">{e(u['p2_s'])}</p>
    {choice('0', u['none_t'], u['none_s'], True)}
    {choice('1', u['cov_t'], u['cov_s'], False)}
    <div id="fx-cover-fields" style="display:none;margin-top:14px">
      {field('cover-to', u['c_to'], 'text', '', 'off', 'maxlength="100"')}
      {field('cover-from', u['c_from'], 'text', '', 'name', 'maxlength="100"')}
      {field('cover-fax', u['c_fax'], 'tel', u['c_fax_h'], 'off', 'maxlength="30" inputmode="tel"')}
      {field('cover-phone', u['c_phone'], 'tel', '', 'tel', 'maxlength="30"')}
      {field('cover-email', u['c_email'], 'email', '', 'email', 'maxlength="200"')}
      {field('cover-address', u['c_addr'], 'textarea', '', 'off', 'rows="3" style="min-height:80px"')}
      {field('cover-note', u['c_note'], 'textarea', '', 'off', 'rows="4"')}
    </div>
    <p class="field-note" id="fx-err-2" role="alert" style="color:var(--red)"></p>
    <div class="panel-nav">
      <button type="button" class="btn btn-outline" id="fx-back-2">{e(u['back'])}</button>
      <button type="button" class="btn btn-red btn-large" id="fx-next-2">{e(u['review'])}</button>
    </div>
  </div>

  <div class="panel" id="panel-3">
    <div class="eyebrow">{step(3)}</div>
    <h2 class="panel-title serif">{e(u['p3_t'])}</h2>
    <p class="panel-sub">{e(u['p3_s'])}</p>
    <div class="real-preview" id="fx-preview" style="display:block">
      <div class="real-preview-head"><span class="real-preview-label">{e(u['prev_l'])}</span><span class="real-preview-sub" id="fx-preview-count"></span></div>
      <div class="real-preview-stage" id="fx-stage"></div>
      <p class="real-preview-note">{e(u['prev_n'])}</p>
    </div>
    <div class="order-summary">
      <div class="order-summary-row"><span class="label">{e(u['sum_to'])}</span><span class="val" id="fx-sum-to"></span></div>
      <div class="order-summary-row"><span class="label">{e(u['sum_pages'])}</span><span class="val" id="fx-sum-pages"></span></div>
      <div class="order-summary-row"><span class="label">{e(u['sum_cover'])}</span><span class="val" id="fx-sum-cover"></span></div>
      <div class="order-summary-row total"><span class="label" style="color:rgba(255,255,255,0.7)">{e(u['sum_total'])}</span><span class="val" id="fx-sum-total"></span></div>
    </div>
    <div class="next-steps">
      <h3>{e(u['next_t'])}</h3>
      <ol>
        <li><span class="n">1</span><span><strong>{e(u['n1_t'])}</strong><span class="d">{e(u['n1_d'])}</span></span></li>
        <li><span class="n">2</span><span><strong>{e(u['n2_t'])}</strong><span class="d">{e(u['n2_d'])}</span></span></li>
        <li><span class="n">3</span><span><strong>{e(u['n3_t'])}</strong><span class="d">{e(u['n3_d'])}</span></span></li>
      </ol>
    </div>
    <div class="privacy-note"><p>{e(u['privacy'])}</p></div>
    <div class="check-row"><input type="checkbox" id="fx-agree"><label for="fx-agree">{u['agree']}</label></div>
    <p class="field-note" id="fx-err-3" role="alert" style="color:var(--red)"></p>
    <div class="panel-nav">
      <button type="button" class="btn btn-outline" id="fx-back-3">{e(u['edit'])}</button>
      <div style="text-align:right">
        <button type="button" id="fx-pay" class="btn btn-red btn-large">{e(u['pay'])}</button>
        <div class="pay-marks" aria-label="Accepted payment methods"><span>Visa</span><span>Mastercard</span><span>Amex</span><span>Apple Pay</span><span>Google Pay</span></div>
      </div>
    </div>
  </div>
  </form>

  <section class="fx-info">
    <h2>{e(t['h1'])}</h2>
    <p>{fill(e(t['answer']))}</p>
    <h2>{e(t['how_h'])}</h2>
    <ol class="steps">{steps_info}</ol>
    <h2>{e(t['can_h'])}</h2>
    <ul>{''.join(f'<li>{e(x)}</li>' for x in t['can'])}</ul>
    <h2>{e(t['doc_h'])}</h2>
    <p>{e(t['doc_p'])}</p>
    <div class="faq"><h2>{e(t['faq_h'])}</h2>{faq}</div>
  </section>
</div>
<style>
.fx-info{{max-width:760px;margin:48px auto 0}}
.fx-info h2{{margin:32px 0 12px}}
.fx-info p,.fx-info li{{line-height:1.7}}
.fx-info ul{{padding-left:20px}}
.real-sheet canvas{{cursor:zoom-in}}
</style>
<script type="module">
import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
window.__fxPdf = pdfjsLib;
document.dispatchEvent(new Event('fx-pdf-ready'));
</script>
<script>
(function(){{
  var T={js}, site='{t['site']}', lang='{t['lang']}', files=[], ref=null, quoteFor=null, step=1;
  var $=function(id){{return document.getElementById(id)}};
  function money(c){{return {t['money']}}}
  function show(n){{
    step=n;
    [1,2,3].forEach(function(i){{
      $('panel-'+i).classList.toggle('active',i===n);
      $('circle-'+i).classList.toggle('active',i===n); $('circle-'+i).classList.toggle('done',i<n);
      $('label-'+i).classList.toggle('active',i===n);
    }});
    window.scrollTo({{top:0,behavior:'smooth'}});
  }}
  fetch('/api/fax/config?site='+site).then(function(r){{return r.json()}}).then(function(c){{
    document.querySelectorAll('[data-fx="base"]').forEach(function(e){{e.textContent=money(c.price_cents)}});
    document.querySelectorAll('[data-fx="page"]').forEach(function(e){{e.textContent=money(c.page_cents)}});
    document.querySelectorAll('[data-fx="incl"]').forEach(function(e){{e.textContent=String(c.included_pages)}});
    if(!c.open){{$('fx-form').style.display='none';$('fx-closed').style.display='block'}}
  }}).catch(function(){{}});
  function digits(v){{var d=String(v||'').replace(/\\D/g,''); if(d.length===11&&d[0]==='1')d=d.slice(1); return d}}
  function renderList(){{
    var ul=$('fx-list'); ul.innerHTML='';
    files.forEach(function(f,i){{
      var li=document.createElement('li'); var name=document.createElement('span'); name.textContent=f.name+' · '+(f.size/1048576).toFixed(1)+' MB';
      var b=document.createElement('button'); b.type='button'; b.className='remove'; b.setAttribute('aria-label',T.remove+' '+f.name); b.textContent='×';
      b.addEventListener('click',function(){{files.splice(i,1);renderList();quoteFor=null}});
      li.append(name,b); ul.appendChild(li);
    }});
  }}
  function addFiles(list){{
    $('fx-err-1').textContent='';
    Array.prototype.forEach.call(list,function(f){{
      if(!/\\.(pdf|jpe?g|png)$/i.test(f.name)){{$('fx-err-1').textContent=T.bad_type;return}}
      if(files.length>=5){{$('fx-err-1').textContent=T.too_many;return}}
      files.push(f);
    }});
    if(files.reduce(function(n,f){{return n+f.size}},0)>20*1024*1024){{$('fx-err-1').textContent=T.too_big}}
    renderList(); quoteFor=null;
  }}
  $('fx-zone').addEventListener('click',function(){{$('fx-files').click()}});
  $('fx-zone').addEventListener('keydown',function(e){{if(e.key==='Enter'||e.key===' '){{e.preventDefault();$('fx-files').click()}}}});
  $('fx-zone').addEventListener('dragover',function(e){{e.preventDefault()}});
  $('fx-zone').addEventListener('drop',function(e){{e.preventDefault();addFiles(e.dataTransfer.files)}});
  $('fx-files').addEventListener('change',function(){{addFiles(this.files);this.value=''}});
  document.querySelectorAll('input[name="fx-cover"]').forEach(function(r){{r.addEventListener('change',function(){{
    $('fx-cover-fields').style.display=document.querySelector('input[name="fx-cover"]:checked').value==='1'?'block':'none'; quoteFor=null;
  }})}});
  ['fx-to','cover-to','cover-from','cover-fax','cover-phone','cover-email','cover-address','cover-note'].forEach(function(id){{$(id).addEventListener('input',function(){{quoteFor=null}})}});
  $('fx-next-1').addEventListener('click',function(){{
    var d=digits($('fx-to').value);
    if(d.length!==10){{$('fx-err-1').textContent=T.need_to;$('fx-to').focus();return}}
    if(!files.length){{$('fx-err-1').textContent=T.need_doc;return}}
    if(files.length>5){{$('fx-err-1').textContent=T.too_many;return}}
    if(files.reduce(function(n,f){{return n+f.size}},0)>20*1024*1024){{$('fx-err-1').textContent=T.too_big;return}}
    $('fx-err-1').textContent=''; show(2);
  }});
  $('fx-back-2').addEventListener('click',function(){{show(1)}});
  $('fx-back-3').addEventListener('click',function(){{show(2)}});
  function drawPreview(url){{
    var stage=$('fx-stage'); stage.innerHTML='<div class="real-preview-loading">'+T.prev_wait+'</div>';
    var go=function(){{
      fetch(url,{{cache:'no-store'}}).then(function(r){{if(!r.ok)throw 0;return r.arrayBuffer()}}).then(function(buf){{return window.__fxPdf.getDocument({{data:buf}}).promise}}).then(function(doc){{
        stage.innerHTML=''; var chain=Promise.resolve();
        for(var i=1;i<=doc.numPages;i++)(function(i){{chain=chain.then(function(){{return doc.getPage(i).then(function(pg){{
          var vp=pg.getViewport({{scale:1.4}}), c=document.createElement('canvas'); c.width=vp.width; c.height=vp.height;
          return pg.render({{canvasContext:c.getContext('2d'),viewport:vp}}).promise.then(function(){{
            var sheet=document.createElement('div'); sheet.className='real-sheet'; var cap=document.createElement('div'); cap.className='real-sheet-cap'; cap.textContent=i+' / '+doc.numPages;
            c.addEventListener('click',function(){{
              var ov=document.createElement('div'); ov.className='real-zoom'; var big=document.createElement('canvas'); big.width=c.width; big.height=c.height; big.getContext('2d').drawImage(c,0,0);
              var x=document.createElement('button'); x.type='button'; x.className='real-zoom-close'; x.textContent='×';
              var done=function(){{ov.remove();x.remove()}}; ov.addEventListener('click',function(ev){{if(ev.target===ov)done()}}); x.addEventListener('click',done);
              ov.appendChild(big); document.body.append(ov,x);
            }});
            sheet.append(c,cap); stage.appendChild(sheet);
          }});
        }})}})}})(i);
        return chain;
      }}).catch(function(){{stage.innerHTML='<div class="real-preview-loading">'+T.prev_fail+'</div>'}});
    }};
    if(window.__fxPdf)go(); else document.addEventListener('fx-pdf-ready',go,{{once:true}});
  }}
  function formKey(){{return [digits($('fx-to').value),files.map(function(f){{return f.name+f.size}}).join('|'),new URLSearchParams(new FormData($('fx-form'))).toString(),(document.querySelector('input[name="fx-cover"]:checked')||{{}}).value].join('#')}}
  $('fx-next-2').addEventListener('click',function(){{
    var key=formKey(); if(key===quoteFor&&ref){{show(3);return}}
    var fd=new FormData(); fd.append('to',$('fx-to').value); fd.append('site',site); fd.append('lang',lang);
    var cover=(document.querySelector('input[name="fx-cover"]:checked')||{{}}).value==='1';
    fd.append('cover',cover?'1':'0');
    if(cover)['to','from','fax','phone','email','address','note'].forEach(function(k){{fd.append('cover_'+k,$('cover-'+k).value)}});
    files.forEach(function(f){{fd.append('document',f,f.name)}});
    var b=$('fx-next-2'), label=b.textContent; b.disabled=true; b.textContent=T.preparing; $('fx-err-2').textContent='';
    fetch('/api/fax/quote?lang='+lang,{{method:'POST',body:fd}}).then(function(r){{return r.json().then(function(j){{return {{ok:r.ok,j:j}}}})}}).then(function(x){{
      b.disabled=false; b.textContent=label;
      if(!x.ok){{$('fx-err-2').textContent=x.j.error||T.again;return}}
      ref=x.j.ref; quoteFor=key;
      $('fx-sum-to').textContent=x.j.to; $('fx-sum-pages').textContent=String(x.j.pages); $('fx-sum-cover').textContent=x.j.cover?T.yes:T.no;
      $('fx-sum-total').textContent=money(x.j.price_cents)+' '+x.j.currency;
      $('fx-preview-count').textContent=x.j.pages+(x.j.pages===1?T.page:T.pages);
      $('fx-pay').textContent=T.pay+' · '+money(x.j.price_cents);
      drawPreview(x.j.preview); show(3);
    }}).catch(function(){{b.disabled=false;b.textContent=label;$('fx-err-2').textContent=T.upfail}});
  }});
  $('fx-pay').addEventListener('click',function(){{
    if(!$('fx-agree').checked){{$('fx-err-3').textContent=T.need_agree;return}}
    if(!ref)return; var b=$('fx-pay'); b.disabled=true; $('fx-err-3').textContent='';
    fetch('/api/fax/checkout',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{ref:ref,lang:lang}})}}).then(function(r){{return r.json().then(function(j){{return {{ok:r.ok,j:j}}}})}}).then(function(x){{
      if(x.ok&&x.j.url){{location.href=x.j.url;return}}
      b.disabled=false; $('fx-err-3').textContent=x.j.error||T.payfail;
    }}).catch(function(){{b.disabled=false;$('fx-err-3').textContent=T.payfail2}});
  }});
}})();
</script>'''
