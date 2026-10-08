from pathlib import Path
import re, html, json
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, CondPageBreak, Table, TableStyle, Image, Preformatted, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

ROOT=Path(__file__).resolve().parent
pdfmetrics.registerFont(TTFont('Arial','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFont(TTFont('Consolas','C:/Windows/Fonts/consola.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='ArialBold',italic='Arial',boldItalic='ArialBold')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle('BodyCustom',fontName='Arial',fontSize=11,leading=14.7,spaceAfter=8,textColor=colors.black))
styles.add(ParagraphStyle('TitleCustom',fontName='ArialBold',fontSize=28,leading=33,spaceAfter=24,textColor=colors.black))
styles.add(ParagraphStyle('HeadingCustom',fontName='ArialBold',fontSize=19,leading=23,spaceAfter=14,textColor=colors.black,keepWithNext=True))
styles.add(ParagraphStyle('CellCustom',fontName='Arial',fontSize=9.3,leading=12,spaceAfter=0))
styles.add(ParagraphStyle('CaptionCustom',fontName='Arial',fontSize=9.5,leading=12,spaceBefore=5,spaceAfter=12,textColor=colors.HexColor('#555555')))
styles.add(ParagraphStyle('CodeCustom',fontName='Consolas',fontSize=8.4,leading=11,spaceAfter=8))
styles.add(ParagraphStyle('TOCCustom',fontName='Arial',fontSize=10,leading=13,spaceAfter=4))

def markup(s):
    s=html.escape(s.replace('**','').replace('`',''))
    return re.sub(r'(https?://[^\s]+)',lambda m:'<link href="'+m.group(1)+'" color="#235B91">'+m.group(1)+'</link>',s)
def para(s,style='BodyCustom'): return Paragraph(markup(s),styles[style])
lines=(ROOT/'avyora-developer-implementation-specification-2026-10-07.md').read_text(encoding='utf-8').splitlines()
headings=[l[3:] for l in lines if l.startswith('## ')]
story=[]; i=0; chapter=0
while i<len(lines):
    line=lines[i]
    if not line.strip(): i+=1; continue
    if line.startswith('# '): story.append(para(line[2:],'TitleCustom')); i+=1; continue
    if line.startswith('## '):
        if chapter==0:
            story.append(PageBreak()); story.append(para('Contents','HeadingCustom'))
            for h in headings: story.append(Paragraph('<link href="#chapter'+h.split(' ')[0]+'">'+html.escape(h)+'</link>',styles['TOCCustom']))
        chapter+=1
        story.append(PageBreak() if chapter==1 else CondPageBreak(360))
        if chapter>1: story.append(Spacer(1,18))
        heading_flow=Paragraph('<a name="chapter'+str(chapter)+'"/>'+html.escape(line[3:]),styles['HeadingCustom'])
        j=i+1
        while j<len(lines) and not lines[j].strip(): j+=1
        if j<len(lines) and lines[j].startswith('!['):
            m=re.match(r'!\[(.*?)\]\((.*?)\)',lines[j]); path=ROOT/m.group(2); w,h=PILImage.open(path).size
            width=496.8; height=width*h/w
            if height>340: width=340*w/h; height=340
            story.append(KeepTogether([heading_flow,Image(str(path),width=width,height=height),para(m.group(1),'CaptionCustom')]))
            i=j+1; continue
        story.append(heading_flow); i+=1; continue
    if line.startswith('!['):
        m=re.match(r'!\[(.*?)\]\((.*?)\)',line); path=ROOT/m.group(2); w,h=PILImage.open(path).size; width=496.8; height=width*h/w
        if height>340: width=340*w/h; height=340
        story.append(KeepTogether([Image(str(path),width=width,height=height),para(m.group(1),'CaptionCustom')]))
        i+=1; continue
    if line.startswith('```'):
        i+=1; codes=[]
        while i<len(lines) and not lines[i].startswith('```'): codes.append(lines[i]); i+=1
        i+=1
        for code in codes:
            if len(code)>86:
                # Wrap comments and interface sketches without losing text.
                import textwrap
                codes2=textwrap.wrap(code,width=86,subsequent_indent='  ',replace_whitespace=False,drop_whitespace=False)
            else: codes2=[code]
            for c in codes2: story.append(Preformatted(c,styles['CodeCustom']))
        story.append(Spacer(1,5)); continue
    if line.startswith('|'):
        block=[]
        while i<len(lines) and lines[i].startswith('|'): block.append(lines[i]); i+=1
        headers=[v.strip() for v in block[0].strip('|').split('|')]
        rows=[[v.strip() for v in l.strip('|').split('|')] for l in block[2:]]
        data=[[Paragraph('<b>'+markup(v)+'</b>',styles['CellCustom']) for v in headers]]+[[para(v,'CellCustom') for v in row] for row in rows]
        widths={2:[151,345.8],3:[111.6,190.8,194.4],4:[111.6,115.2,136.8,133.2]}[len(headers)]
        t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.45,colors.HexColor('#D9D9D9')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8E8E8')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
        story.extend([t,Spacer(1,10)]); continue
    story.append(para(line)); i+=1

output=ROOT/'Avyora Developer Implementation Specification.pdf'
def page(c,doc):
    c.setFont('Arial',8); c.setFillColor(colors.HexColor('#666666'))
    c.drawRightString(554.4,28,'Avyora developer specification  |  '+str(doc.page))
doc=SimpleDocTemplate(str(output),pagesize=(612,792),leftMargin=57.6,rightMargin=57.6,topMargin=50.4,bottomMargin=50.4,title='Avyora Developer Implementation Specification',author='Avyora')
doc.build(story,onFirstPage=page,onLaterPages=page)
print(json.dumps({'pdf':str(output),'chapters':chapter,'bytes':output.stat().st_size}))
