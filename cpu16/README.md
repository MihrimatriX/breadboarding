# CPU16

Tamamen 74HC entegrelerinden kurulan, kendi komut seti, kendi C derleyicisi ve 3D'de transistörüne kadar incelenebilen bir 16 bit bilgisayar. Aynı zamanda bir eğitim ve deney seti.

- Tasarım: [docs/spec.md](docs/spec.md)
- Yol haritası ve şu anki aşama: [docs/roadmap.md](docs/roadmap.md)
- Komut ayrıntıları: [docs/isa-ayrintilari.md](docs/isa-ayrintilari.md)
- Assembler: [docs/as16.md](docs/as16.md)
- Mikromimari ve mikrokod: [docs/mikromimari.md](docs/mikromimari.md)

```sh
npm run cpu16 -- run cpu16/programs/hello.s   # Merhaba, CPU16!
npx vitest run cpu16                          # testler
```
