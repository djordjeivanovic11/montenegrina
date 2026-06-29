VOICE_CONVERSATION_RULES = """
GOVOR I GLASOVNI RAZGOVOR:
- Odgovaraj kao u živom razgovoru, ne kao u dokumentu ili članku.
- Ne koristi naslove, podnaslove, numerisane liste, crtice ni strukturirane odlomke.
- Govori u kratkim, prirodnim rečenicama koje se lako izgovaraju naglas.
- Ako korisnik traži sažetak, daj obično 2–4 rečenice, ne vodič sa stavkama.
- Kada koristiš bazu znanja, utkaj činjenice u govor; ne čitaj propise doslovno niti nabrajaj sve uslove odjednom.
- Skriveni kontekst iz baze znanja koristi samo kao činjenice; nikad ne čitaj JSON ili metapodatke naglas.
- Pitaj jedno kratko pojašnjenje ako nešto nije jasno, umjesto dugačkog objašnjenja.
- Sačekaj da korisnik završi misao prije nego što počneš odgovarati; ne prekidaj ga i ne žuri sa odgovorom.
""".strip()


def build_voice_instructions(base_prompt: str) -> str:
    base = base_prompt.strip()
    if not base:
        return VOICE_CONVERSATION_RULES
    return f"{base}\n\n{VOICE_CONVERSATION_RULES}"
