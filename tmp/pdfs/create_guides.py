import json, html
from pathlib import Path
import pymupdf
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold', 'C:/Windows/Fonts/arialbd.ttf'))
TEAL = colors.HexColor('#00858b')
NAVY = colors.HexColor('#19304e')
styles = {
 'body': ParagraphStyle('body', fontName='Arial', fontSize=10, leading=14.5, spaceAfter=9),
 'title': ParagraphStyle('title', fontName='ArialBold', fontSize=21, leading=26, textColor=NAVY, spaceAfter=18),
 'heading': ParagraphStyle('heading', fontName='ArialBold', fontSize=11.5, leading=16, textColor=TEAL, spaceBefore=9, spaceAfter=8),
 'label': ParagraphStyle('label', fontName='ArialBold', fontSize=10, leading=14, textColor=TEAL, spaceAfter=10),
 'small': ParagraphStyle('small', fontName='Arial', fontSize=9, leading=13, spaceAfter=5),
}
data = json.loads((ROOT/'tmp/pdfs/guide-data.json').read_text(encoding='utf-8'))
def p(text, style='body'):
 return Paragraph(html.escape(text).replace('\n','<br/>'), styles[style])
def table(rows):
 t=Table([[p(a,'small'),p(b,'small')] for a,b in rows],colWidths=[145,342],hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e5eff3')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,1),(-1,-1),.5,colors.HexColor('#e5ebef'))]))
 return t
intro = {
 'etic7': ('ETIC7','ETIC7, B2B, B2C ve katalog kullanım modellerini ortak bir e-ticaret altyapısında bir araya getirmeyi amaçlayan bir platform projesidir. Ürün, stok, fiyat, müşteri ve sipariş yönetimi; ödeme, kargo, kurumsal sistemler ve dijital pazarlama bağlantılarıyla birlikte ele alınır.', [('Yönetici','Ürün, kategori, fiyat, kampanya, kullanıcı ve entegrasyon ayarlarını yönetir.'),('Müşteri / bayi','Katalog ve fiyatları inceler; sepet, sipariş ve ödeme süreçlerini kullanır.'),('Operasyon ekibi','Sipariş, kargo, iptal, iade ve veri aktarımı süreçlerini takip eder.')]),
 'anypay': ('ANYPAY','ANYPAY, işletmelerin ödeme ve bayi tahsilat süreçlerini merkezi bir yapı üzerinden yönetmesini amaçlayan akıllı ödeme orkestrasyonu projesidir. Sanal POS ve ödeme kuruluşu bağlantıları; link ve QR tahsilat, bayi hiyerarşisi, mobil saha kullanımı ve mutabakat süreçleriyle birlikte ele alınır.', [('Yönetici','Banka/POS bağlantılarını, ödeme setlerini, komisyonları ve erişim yetkilerini düzenler.'),('Bayi / alt bayi','Kendisine tanımlanan kapsamda tahsilat ve işlem kayıtlarını takip eder.'),('Saha personeli','Mobil kanallarda link veya QR ile tahsilat sürecini başlatır.'),('Finans ekibi','İşlem sonuçlarını, iptal/iade ve mutabakat kayıtlarını takip eder.')])
}
class NumberedCanvas(canvas.Canvas):
 def __init__(self,*args,**kwargs):
  super().__init__(*args,**kwargs); self.states=[]
 def showPage(self):
  self.states.append(dict(self.__dict__)); self._startPage()
 def save(self):
  total=len(self.states)
  for state in self.states:
   self.__dict__.update(state)
   self.setStrokeColor(colors.HexColor('#d5e0e8')); self.line(48,45,547,45)
   self.setFont('Arial',8); self.setFillColor(colors.HexColor('#526781'))
   self.drawString(48,30,self._doc_title+'  |  Sistem tanıtımı')
   self.drawRightString(547,30,f'{self._pageNumber} / {total}')
   super().showPage()
  super().save()

for key,g in data.items():
 name,description,roles=intro[key]
 story=[p('SİSTEM TANITIMI / 12 EKİM 2026','label'),p(name,'title'),p(description),p('Temel amaç','heading'),p('İşletmenin ilgili süreçlerini tek bir yönetim yapısında toplamak, kullanıcıya uygun işlem akışları sunmak ve entegrasyonlar arasında veri takibini kolaylaştırmak.'),table([('Taraf','Sistemdeki işi')]+roles),p('Belgenin içeriği','heading'),p('Bu tanıtım, proje kapsamını ve destek ekranında yer alan başlıca kullanım alanlarını düzenli bir başvuru belgesi olarak sunar. Modüller, entegrasyonlar ve destek kontrol adımları ayrı bölümlerde açıklanır.'),p('Kullanım alanları','heading'),p(' • '.join(x['title'] for x in g['productAreas']))]
 story += [PageBreak(),p('01 / MODÜLLER VE İŞ AKIŞLARI','label'),p('Sistemin temel bölümleri','title')]
 for a in g['productAreas']:
  story.append(KeepTogether([p(a['title'],'heading'),p(a['description'])]))
 story += [PageBreak(),p('02 / ENTEGRASYON VE ALTYAPI','label'),p('Bağlantılar ve teknik yapı','title')]
 for a in g['integrations']:
  story.append(KeepTogether([p(a['title'],'heading'),p(a['description'])]))
 story += [p('Teknik bileşenler','heading'),p(', '.join(g['architecture'])),p('İşlem takibi','heading'),p('Entegrasyon kontrollerinde sistem kaydı ile dış servisin yanıtı aynı işlem veya kayıt kimliği üzerinden karşılaştırılır. Kullanıcı, işlem zamanı ve hata bilgisi destek kaydında birlikte tutulur.')]
 for i,b in enumerate(g['playbooks']):
  story += [PageBreak(),p(f'03 / DESTEK KONTROLLERİ / {i+1:02d}','label'),p(b['title'],'title'),p(b['summary']),p('Kontrol adımları','heading')]
  story += [p(f'{n+1}. {s}') for n,s in enumerate(b['checks'])]
  story += [p('Destek kaydında toplanacak bilgiler','heading')]+[p('• '+s) for s in b['collect']]
  story += [p('Değerlendirme ve sonraki adım','heading'),p(b['outcome'])]
 file=OUT/f'{key}-sistem-tanitimi.pdf'
 doc=SimpleDocTemplate(str(file),pagesize=(595.28,841.89),leftMargin=54,rightMargin=54,topMargin=54,bottomMargin=65,title=name+' Sistem Tanıtımı',author='Güzel Teknoloji')
 def make_canvas(*args,**kwargs):
  c=NumberedCanvas(*args,**kwargs); c._doc_title=name; return c
 doc.build(story,canvasmaker=make_canvas)
 d=pymupdf.open(file)
 for j,page in enumerate(d):
  page.get_pixmap(matrix=pymupdf.Matrix(.75,.75)).save(str(ROOT/f'tmp/pdfs/{key}-{j+1:02d}.png'))
  assert '\ufffd' not in page.get_text(), 'Broken glyph'
 print(key,len(d),'pages',file)
