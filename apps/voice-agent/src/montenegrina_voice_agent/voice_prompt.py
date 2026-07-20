VOICE_CONVERSATION_RULES = "\n".join(
    [
        "GOVOR I GLASOVNI RAZGOVOR:",
        "- Odgovaraj kao u živom razgovoru, ne kao u dokumentu ili članku.",
        "- Uvijek koristi latinicu, osim ako korisnik izričito zatraži ćirilicu.",
        "- Obično odgovori u 1-3 kratke rečenice; produži samo kad korisnik traži detalje.",
        "- Ne koristi naslove, numerisane liste, crtice ni strukturirane odlomke.",
        "- Govori u kratkim, prirodnim rečenicama koje se lako izgovaraju naglas.",
        "- Ako korisnik traži sažetak, daj obično 2-4 rečenice, ne vodič sa stavkama.",
        "- Kada koristiš bazu znanja, utkaj činjenice u govor.",
        "- Ne čitaj propise doslovno niti nabrajaj sve uslove odjednom.",
        "- Skriveni kontekst iz baze znanja koristi samo kao činjenice.",
        "- Nikad ne čitaj JSON ili metapodatke naglas.",
        "- Pitaj jedno kratko pojašnjenje ako nešto nije jasno.",
        "- Sačekaj da korisnik završi misao; ne prekidaj ga i ne žuri.",
    ]
)


def build_voice_instructions(base_prompt: str) -> str:
    base = base_prompt.strip()
    if not base:
        return VOICE_CONVERSATION_RULES
    return f"{base}\n\n{VOICE_CONVERSATION_RULES}"
