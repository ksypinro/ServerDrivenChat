"""Generate dependency-free, accessible SVG diagrams used by the README.

Run from any directory with Python 3. SVGs contain only native vector elements.
"""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'assets'
INK = '#172b46'
MUTED = '#50627a'
BLUE = '#345de3'
TEAL = '#087e83'
PURPLE = '#7354ba'

class Diagram:
    def __init__(self, height, title, subtitle, description):
        self.parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="{height}" viewBox="0 0 1440 {height}" role="img" aria-labelledby="title description">
<title id="title">{escape(title)}</title><desc id="description">{escape(description)}</desc>
<defs>
 <marker id="blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{BLUE}"/></marker>
 <marker id="teal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{TEAL}"/></marker>
 <marker id="gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{MUTED}"/></marker>
</defs>
<rect width="1440" height="{height}" rx="24" fill="#f5f7fc"/>
<rect x="0" y="0" width="1440" height="130" rx="24" fill="{INK}"/>
<rect x="0" y="90" width="1440" height="40" fill="{INK}"/>
''']
        self.text(44, 35, 'SERVER-DRIVEN CHAT  /  SYSTEM DESIGN', 13, '#a9c3f7', weight=700)
        self.text(44, 75, title, 30, '#ffffff', weight=700)
        self.text(44, 105, subtitle, 16, '#d3deef')

    def text(self, x, y, text, size=16, color=INK, anchor='start', weight=400):
        self.parts.append(f'<text x="{x}" y="{y}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{escape(text)}</text>')

    def rect(self, x, y, w, h, fill='#ffffff', stroke='#d8e0ef', radius=14):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>')

    def box(self, x, y, w, h, title, lines=(), color=BLUE):
        self.rect(x, y+4, w, h, '#e5eaf3', '#e5eaf3')
        self.rect(x, y, w, h)
        self.parts.append(f'<rect x="{x+15}" y="{y+18}" width="4" height="{h-36}" rx="2" fill="{color}"/>')
        self.text(x+31, y+31, title, 19, INK, weight=700)
        for i, line in enumerate(lines):
            self.text(x+31, y+55+i*22, line, 15, MUTED)

    def path(self, d, color='blue', dash=False, both=False):
        palette={'blue': BLUE, 'teal': TEAL, 'gray': MUTED}
        extra=(' stroke-dasharray="7 6"' if dash else '') + (f' marker-start="url(#{color})"' if both else '')
        self.parts.append(f'<path d="{d}" fill="none" stroke="{palette[color]}" stroke-width="2.3" stroke-linejoin="round" marker-end="url(#{color})"{extra}/>')

    def label(self, x, y, text, color=MUTED):
        width=len(text)*7.7+18
        self.rect(x-width/2, y-17, width, 25, '#f5f7fc', '#f5f7fc', 6)
        self.text(x, y, text, 14, color, 'middle', 600)

    def save(self, name):
        (OUT/name).write_text('\n'.join(self.parts)+ '\n</svg>\n')


def architecture():
    d=Diagram(1150, 'One server. One consented native task.',
        'Public clients share a durable control plane; Cline remains the model executor.',
        'Browser and API clients connect through Nginx. API routes pass through FastAPI to the TypeScript server. The server owns PostgreSQL and attachments and validates OIDC identity. The desktop bridge initiates HTTPS POST and SSE connections, persists receipts in SQLite, and controls a consented Cline task through the reviewed native API. Cline connects to its configured model service.')
    d.rect(40, 435, 830, 540, '#edf2fc', '#cad7ef', 20)
    d.text(310, 467, '01  LOCAL DOCKER SERVICES', 14, BLUE, weight=700)
    d.rect(910, 435, 490, 540, '#eaf5f4', '#bfdedb', 20)
    d.text(934, 467, '02  ISOLATED VS CODE · macOS', 14, TEAL, weight=700)
    # All connectors precede cards so arrow endpoints meet clean card boundaries.
    d.path('M 420 233 V 263 H 660 V 292')
    d.path('M 1010 233 V 263 H 780 V 292')
    d.label(720, 262, 'HTTPS')
    d.path('M 570 338 H 220 V 505')
    d.label(220, 407, 'Public APIs')
    d.path('M 690 384 V 505')
    d.label(690, 413, 'UI + bridge routes')
    d.path('M 870 336 H 1155 V 505', 'teal', both=True)
    d.label(1155, 382, 'HTTPS POST + SSE', TEAL)
    d.label(1155, 407, 'Bridge initiates the connection', TEAL)
    d.path('M 370 556 H 520')
    d.label(445, 543, 'Private HTTP')
    d.path('M 520 585 H 440 V 758 H 210 V 822', 'gray')
    d.label(328, 748, 'Validate identity')
    d.path('M 580 620 V 690 H 485 V 822', 'gray')
    d.path('M 760 620 V 822', 'gray')
    d.label(690, 718, 'Durable state')
    d.path('M 570 360 H 60 V 880 H 88', 'gray')
    d.label(190, 360, 'OIDC sign-in routes')
    d.path('M 1155 605 V 670', 'teal', both=True)
    d.path('M 980 555 H 940 V 868 H 980', 'teal', both=True)
    d.text(957, 792, 'Native API', 14, TEAL)
    d.path('M 1155 923 V 1015', 'teal', both=True)
    d.label(1155, 992, 'Configured provider', TEAL)
    d.box(260, 155, 320, 78, 'Browser control UI', ['Prompts, questions and controls'])
    d.box(850, 155, 320, 78, 'API clients / SDKs', ['REST and compatible profiles'])
    d.box(570, 292, 300, 92, 'Nginx HTTPS edge', ['TLS and route selection'])
    d.box(90, 505, 280, 115, 'FastAPI gateway', ['Request / response formats', 'SSE relay · no native access'])
    d.box(520, 505, 310, 115, 'TypeScript server', ['Authorization and scheduling', 'Operations, history and policy'])
    d.box(88, 822, 245, 103, 'Keycloak', ['OIDC sign-in', 'Identity validation'], PURPLE)
    d.box(365, 822, 240, 103, 'PostgreSQL', ['Commands and events', 'Credentials and history'], PURPLE)
    d.box(637, 822, 200, 103, 'Attachments', ['Committed files', 'Durable storage'], PURPLE)
    d.box(980, 505, 350, 100, 'SDC companion extension', ['Bridge runtime + Cline adapter'], TEAL)
    d.box(1000, 670, 310, 95, 'Local SQLite', ['Persistent inbox and outbox'], PURPLE)
    d.box(980, 823, 350, 100, 'Maintained Cline', ['Existing task + native permissions'], TEAL)
    d.box(1000, 1015, 310, 85, 'Model service', ['Called by Cline'], TEAL)
    d.text(44, 1042, 'THE AUTHORITY BOUNDARY', 13, BLUE, weight=700)
    d.text(44, 1072, 'The server authorizes work. The bridge checks current authority.', 17)
    d.text(44, 1098, 'Cline executes within the user’s native permissions.', 17)
    d.save('runtime-architecture.svg')


def flow():
    d=Diagram(1440, 'From prompt to recorded response',
        'An API request travels through durable admission, native execution and correlated events.',
        'Sequence diagram with six participants: user, API client, FastAPI gateway, TypeScript server, desktop bridge and Cline. Steps show prompt submission, authentication and request identity, server persistence, SSE delivery, local authority checks, native execution, acknowledgements and persisted output returned to the caller.')
    d.rect(44, 151, 1352, 50, '#eaf5f4', '#bfdedb', 10)
    d.text(64, 183, 'PRECONDITION', 13, TEAL, weight=700)
    d.text(195, 183, 'Graphical sign-in, pairing, task selection and local consent are already complete.', 17)
    xs=[130,366,602,838,1074,1310]
    names=[('User','Human'),('API client','REST / SDK'),('Gateway','FastAPI'),('Server','TypeScript'),('Bridge','Desktop'),('Cline task','Native app')]
    for x,(title,sub) in zip(xs,names):
        d.parts.append(f'<path d="M {x} 304 V 1300" stroke="#c6d1e2" stroke-width="1.5" stroke-dasharray="5 7"/>')
        d.rect(x-91, 224, 182, 80, '#ffffff', '#cad7ef')
        d.text(x, 256, title, 20, INK, 'middle', 700)
        d.text(x, 282, sub, 14, MUTED, 'middle')
    def band(y,label,color):
        d.rect(44,y,1352,34,'#e8edf6','#e8edf6',7)
        d.text(62,y+23,label,13,color,weight=700)
    def arrow(y,a,b,label,number,returning=False):
        color='teal' if returning else 'blue'
        d.path(f'M {xs[a]} {y} H {xs[b]}',color,dash=returning)
        mid=(xs[a]+xs[b])/2
        d.label(mid,y-13,label,TEAL if returning else BLUE)
        # Number badge is offset from the source lifeline.
        bx=xs[a]+(-17 if b>a else 17)
        d.parts.append(f'<circle cx="{bx}" cy="{y}" r="12" fill="{TEAL if returning else BLUE}"/>')
        d.text(bx,y+4,str(number),12,'#ffffff','middle',700)
    def note(x,y,lines):
        d.rect(x-105,y,210,62,'#eef1fe','#cbd5f6',9)
        for i,line in enumerate(lines):d.text(x,y+25+i*22,line,14,INK,'middle',600)
    band(325,'01  ADMIT THE REQUEST',BLUE)
    arrow(399,0,1,'Submit prompt',1)
    arrow(463,1,2,'Auth + request identity',2)
    arrow(527,2,3,'Normalize and forward',3)
    note(xs[3],552,['Check scope and readiness','Persist durable operation'])
    band(644,'02  DELIVER AND EXECUTE',BLUE)
    arrow(718,3,4,'Command over SSE',4)
    note(xs[4],743,['Persist local receipt','Check current authority'])
    arrow(851,4,5,'Native API input',5)
    arrow(923,5,4,'Native events',6,True)
    d.text(1290,957,'Output, question, approval',14,MUTED,'end')
    d.text(1290,979,'request or terminal event',14,MUTED,'end')
    band(1003,'03  RECORD AND RETURN',TEAL)
    arrow(1080,4,3,'POST receipts + events',7,True)
    note(xs[3],1103,['Persist events','Update operation state'])
    arrow(1210,3,2,'Result / event stream',8,True)
    arrow(1254,2,1,'Profile response / SSE',9,True)
    arrow(1298,1,0,'Display result + state',10,True)
    d.rect(44,1340,1352,70,'#ffffff','#d8e0ef',12)
    d.text(66,1368,'ACCEPTED ≠ COMPLETED',13,BLUE,weight=700)
    d.text(300,1368,'HTTP admission records work; native events establish its outcome.',16)
    d.text(66,1394,'Provider streams return committed output using the profile’s buffering rules. Local permissions remain authoritative.',15,MUTED)
    d.save('prompt-response-flow.svg')

if __name__ == '__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    architecture()
    flow()
