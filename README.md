# Семейное Древо (Family Tree)

Веб-приложение для построения и управления генеалогическим древом семьи.

## Возможности

- 🌳 Визуализация семейного древа
- 👤 Карточки с информацией о членах семьи
- ✏️ Редактирование данных (ФИО, дата и место рождения)
- ➕ Добавление родственников (партнёр, отец, мать, сын, дочь)
- 🗑️ Удаление записей
- 💾 Автоматическое сохранение в data.json

## Структура проекта

```
hsf/
├── server/           # Backend (Node.js + Express)
│   ├── server.js     # API сервер
│   └── package.json
├── client/           # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.jsx   # Главный компонент
│   │   ├── main.jsx
│   │   └── index.css # Стили
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── data.json         # Данные семейного древа
└── README.md
```

## Установка и запуск

### 1. Установка зависимостей

#### Backend:
```bash
cd server
npm install
```

#### Frontend:
```bash
cd client
npm install
```

### 2. Запуск приложения

#### Backend (в одном терминале):
```bash
cd server
node server.js
```
Сервер запустится на `http://localhost:3001`

#### Frontend (в другом терминале):
```bash
cd client
npm run dev
```
Приложение откроется на `http://localhost:5173`

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | /api/people | Получить всех людей |
| GET | /api/people/:id | Получить человека по ID |
| GET | /api/people/:id/family | Получить человека с семейными связями |
| POST | /api/people | Создать нового человека |
| PUT | /api/people/:id | Обновить данные человека |
| DELETE | /api/people/:id | Удалить человека |
| POST | /api/people/:id/relative | Добавить родственника |

## Структура данных

```json
{
  "people": {
    "id": {
      "id": "unique_id",
      "name": "Имя",
      "lastName": "Фамилия",
      "middleName": "Отчество",
      "gender": "male|female",
      "birthDate": "YYYY-MM-DD",
      "birthPlace": "Город",
      "fatherId": "id_отца|null",
      "motherId": "id_матери|null",
      "partnerId": "id_партнёра|null",
      "children": ["id_ребёнка1", "id_ребёнка2"],
      "isAlive": true,
      "hasMatch": false
    }
  }
}
```

## Технологии

- **Backend**: Node.js, Express, CORS
- **Frontend**: React 18, Vite, Lucide Icons
- **Стилизация**: CSS Variables, Flexbox, Grid
