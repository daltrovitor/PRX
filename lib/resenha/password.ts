// Hello World
import crypto from "crypto";

/**
 * Senha individual do Insider: fácil de lembrar e de ditar, e ainda forte.
 * Quatro palavras curtas (sem acento) + dois números, ex.: "Lobo-Mel-Pipa-Rio-47".
 * São 234 palavras por posição (~31,5 bits) mais 90 números (6,5 bits): cerca de 38 bits,
 * com a trava de tentativas do login do portal (10 por minuto por IP).
 */

export const PASSWORD_WORDS = [
  "Abelha", "Acai", "Agulha", "Alto", "Amora", "Anel", "Areia", "Arroz", "Astro", "Atlas", "Aveia", "Azul", "Bala", "Balao", "Banco", "Barco",
  "Bola", "Bolo", "Bravo", "Brisa", "Cabra", "Cacau", "Cafe", "Calda", "Campo", "Canto", "Carro", "Casa", "Cedro", "Cerca", "Chuva", "Cinza",
  "Circo", "Clara", "Coral", "Corda", "Coroa", "Cravo", "Cubo", "Dado", "Dama", "Dente", "Disco", "Doce", "Dragao", "Duna", "Eixo", "Escada",
  "Estrela", "Faca", "Farol", "Feijao", "Festa", "Fio", "Flauta", "Flor", "Fogo", "Folha", "Forno", "Fruta", "Fumo", "Gaita", "Galo", "Garca",
  "Gato", "Gelo", "Girassol", "Globo", "Goiaba", "Gota", "Grao", "Grilo", "Guapo", "Horta", "Ilha", "Ioga", "Jade", "Jaca", "Jarro", "Jogo",
  "Jovem", "Kiwi", "Laco", "Lago", "Lanca", "Leao", "Lebre", "Leite", "Lenha", "Lima", "Limao", "Linha", "Lobo", "Lotus", "Lua", "Luva",
  "Maca", "Madeira", "Mala", "Manga", "Mapa", "Mar", "Marte", "Massa", "Mel", "Melao", "Mesa", "Milho", "Mina", "Mola", "Moeda", "Monte",
  "Muro", "Nave", "Neve", "Ninho", "Nobre", "Noite", "Nuvem", "Oasis", "Obra", "Ola", "Olho", "Onda", "Onca", "Ouro", "Ovo", "Pacote",
  "Palma", "Panda", "Papel", "Parque", "Pasta", "Pato", "Pedra", "Peixe", "Pente", "Pera", "Perola", "Pinha", "Pipa", "Piso", "Planta", "Plumas",
  "Poema", "Ponte", "Porto", "Prado", "Prata", "Praia", "Prisma", "Pulso", "Queijo", "Quiabo", "Rampa", "Raio", "Rastro", "Rede", "Reino", "Relva",
  "Rio", "Roda", "Rosa", "Rota", "Rubi", "Safira", "Sal", "Salto", "Sapo", "Selva", "Sino", "Sitio", "Sol", "Sombra", "Sonho", "Sorvete",
  "Suco", "Tabua", "Tapete", "Tarde", "Taxi", "Tigre", "Tinta", "Tocha", "Tomate", "Topo", "Torre", "Trem", "Trigo", "Trilha", "Tucano", "Tulipa",
  "Uva", "Vale", "Vapor", "Vela", "Velho", "Vento", "Verde", "Vidro", "Vila", "Vinho", "Viola", "Vulcao", "Zebra", "Zinco", "Zona", "Zumbi",
  "Barro", "Bambu", "Cabo", "Cais", "Cena", "Cesto", "Cume", "Fada", "Fenda", "Fosso", "Gema", "Grama", "Lama", "Loja", "Mato", "Naipe",
  "Pico", "Pinho", "Poco", "Roca", "Sede", "Talha", "Tenda", "Urso", "Vaso", "Zelo",
];

/** "Lobo-Mel-Pipa-Rio-47": palavras sorteadas com crypto.randomInt, sem repetir palavra. */
export function generateInsiderPassword(random: (max: number) => number = crypto.randomInt): string {
  const words = new Set<string>();
  while (words.size < 4) words.add(PASSWORD_WORDS[random(PASSWORD_WORDS.length)]);
  return `${[...words].join("-")}-${10 + random(90)}`;
}
