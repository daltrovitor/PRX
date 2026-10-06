# Hello World
import asyncio
import os
import edge_tts

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "locucao")

CUES = [
    ("01_00.6s_eles_disseram.mp3", "Eles disseram… só assista."),
    ("02_04.8s_sua_geracao.mp3", "Sua geração não espera."),
    ("03_06.4s_prx_pass.mp3", "P-R-X Pass."),
    ("04_07.0s_prx_bank.mp3", "P-R-X Bank."),
    ("05_07.6s_prx_live.mp3", "P-R-X Live."),
    ("06_08.2s_prx_invest.mp3", "P-R-X Invest."),
    ("07_08.8s_prx_me.mp3", "P-R-X Me."),
    ("08_09.55s_beneficios_reais.mp3", "Benefícios reais. Experiências exclusivas. Um só ecossistema."),
    ("09_12.0s_curta_invista_construa.mp3", "Curta. Invista. Construa."),
    ("10_14.4s_o_futuro_nao_se_assiste.mp3", "O futuro não se assiste."),
    ("11_15.6s_se_constroi.mp3", "Se constrói."),
    ("12_18.2s_cta_final.mp3", "Em breve em P-R-X ponto app ponto B-R. Entre na lista VIP."),
]

VOICES = [
    {
        "folder": "masculina",
        "voice": "pt-BR-AntonioNeural",
        "rate": "-3%",
        "pitch": "-2Hz",
    },
    {
        "folder": "feminina",
        "voice": "pt-BR-ThalitaMultilingualNeural",
        "rate": "-2%",
        "pitch": "+0Hz",
    },
]

async def generate_clips():
    for v in VOICES:
        target_dir = os.path.join(OUTPUT_DIR, v["folder"])
        os.makedirs(target_dir, exist_ok=True)
        print(f"Gerando clipes de voz {v['folder']} ({v['voice']})...")
        
        for filename, text in CUES:
            file_path = os.path.join(target_dir, filename)
            communicate = edge_tts.Communicate(
                text=text,
                voice=v["voice"],
                rate=v["rate"],
                pitch=v["pitch"],
            )
            await communicate.save(file_path)
            print(f"  [OK] {filename}")

        # Gerar também a faixa contínua sincronizada com pauses SSML
        # Timestamps calculados:
        # 0.6s inicio -> 1.8s
        # 4.8s inicio -> ~6.0s
        # 6.4s, 7.0s, 7.6s, 8.2s, 8.8s
        # 9.55s -> ~11.5s
        # 12.0s -> ~13.5s
        # 14.4s -> 15.6s
        # 18.2s -> 20.0s
        ssml_full = f"""<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>
    <voice name='{v["voice"]}'>
        <break time='600ms'/>
        Eles disseram… só assista.
        <break time='2600ms'/>
        Sua geração não espera.
        <break time='400ms'/>
        P-R-X Pass.
        <break time='200ms'/>
        P-R-X Bank.
        <break time='200ms'/>
        P-R-X Live.
        <break time='200ms'/>
        P-R-X Invest.
        <break time='200ms'/>
        P-R-X Me.
        <break time='350ms'/>
        Benefícios reais. Experiências exclusivas. Um só ecossistema.
        <break time='600ms'/>
        Curta. Invista. Construa.
        <break time='800ms'/>
        O futuro não se assiste.
        <break time='400ms'/>
        Se constrói.
        <break time='1800ms'/>
        Em breve em P-R-X ponto app ponto B-R. Entre na lista VIP.
    </voice>
</speak>"""
        full_path = os.path.join(target_dir, "00_trilha_locucao_completa_sincronizada_20s.mp3")
        full_comm = edge_tts.Communicate(ssml_full, v["voice"], rate=v["rate"], pitch=v["pitch"])
        await full_comm.save(full_path)
        print(f"  [OK] Trilha completa: 00_trilha_locucao_completa_sincronizada_20s.mp3")

if __name__ == "__main__":
    asyncio.run(generate_clips())
    print("\nTodos os arquivos de áudio da locução foram gerados com sucesso!")
