import requests
import json
import sys
import google.generativeai as genai
from bs4 import BeautifulSoup
from smart_matching import SmartMatching

class PamyatNarodaParser:

    def __init__(self, init_session: bool = True, trashhold: int = 90):
        self.init_session = init_session
        self.session = None
        if self.init_session:
            self.session = self.setup_session()
        self.trashhold = trashhold
        # Initialize SmartMatching for score comparison
        self.sm = None

    def setup_session(self):
        '''
        Инициализируем сессию, получаем токен и куки
        '''
        session = requests.Session()
        url_search_page = "https://pamyat-naroda.ru/heroes/"
        response = session.get(url_search_page)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        csrf_input = soup.find("input", {"name": "csrf"})
        csrf_token = csrf_input["value"] if csrf_input else None

        if not csrf_token:
            raise Exception("Не удалось получить CSRF токен")

        session.headers.update({
            "accept": "application/json",
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            "origin": "https://pamyat-naroda.ru",
            "referer": url_search_page,
            "x-csrf-token": csrf_token
        })
        return session

    def get_response(self, lastName, name, middleName, birthPlace, birthDate):
        '''
        Отправляем запрос по заданным данным
        '''
        if not self.session:
            raise Exception("Сессия не инициализирована")

        body = {
            "entrypoint": "heroes/search",
            "parameters": {
                "query": {
                    "last_name": lastName,
                    "first_name": name,
                    "middle_name": middleName,
                    "birth_place": birthPlace,
                    "birth_date_from": birthDate
                },
                "page": 1,
                "size": 10,
                "options": {"person": True}
            }
        }
        response = self.session.post("https://pamyat-naroda.ru/entrypoint/api/", json=body)
        response.raise_for_status()
        return response.json()

    def parse_response(self, lastName, name, middleName, birthPlace, birthDate):
        try:
            response = self.get_response(lastName, name, middleName, birthPlace, birthDate)
            data = response.get('data', [])

            if not data:
                return None
            person = data[0]['_source']
            person = {
                'lastName': (person.get('last_name') or ""),
                'name': (person.get('first_name') or ""),
                'middleName': (person.get('middle_name') or ""),
                'birthDate': (person.get('date_birth') or ""),
                'birthPlace': (person.get('place_birth') or ""),
                'information': person.get('short_desc')}

            normalized_person = {}
            for key in person.keys():
                if isinstance(person[key], list):
                    normalized_person[key] = person[key][0]
                else:
                    normalized_person[key] = person[key]
            if normalized_person.get('birthDate'):
                normalized_person['birthDate'] = normalized_person['birthDate'].replace('__.','')

            return normalized_person
        except Exception as e:
            return None

    def summarize_information(self, information):
        try:
            client = genai.Client(api_key="AIzaSyAfQwyHAmXCGfFFo7uandhgyvSjWi46GyY")
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"Преобразуй формальную запись в короткую человеческую фразу на русском: {information}"
            )
            return resp.text
        except Exception as e:
            return information

    def compare_persons(self, person1, person2):
        '''
        Compare two persons using SmartMatching algorithm
        '''
        from rapidfuzz import fuzz
        
        lastname_score = fuzz.token_sort_ratio(person1.get('lastName',''), person2.get('lastName',''))
        name_score = fuzz.token_sort_ratio(person1.get('name',''), person2.get('name',''))
        middlename_score = fuzz.token_sort_ratio(person1.get('middleName',''), person2.get('middleName',''))
        pob_score = fuzz.token_sort_ratio(person1.get('birthPlace',''), person2.get('birthPlace',''))
        dob_score = fuzz.token_sort_ratio(person1.get('birthDate',''), person2.get('birthDate',''))

        score = (
            0.25*lastname_score +
            0.25*name_score +
            0.2*middlename_score +
            0.15*pob_score +
            0.15*dob_score
        )
        return score

    def archive_search(self, data):
        result = {"matches": [], "matchedDataIds": []}

        data_json = json.loads(data) if isinstance(data, str) else data

        # Filter people who don't have information yet
        filtered_people = {
            pid: person
            for pid, person in data_json["people"].items()
            if person.get("information") in (None, "")
        }

        if not filtered_people:
            return result

        for idx, person in filtered_people.items():
            query = {
                'lastName': person.get('lastName', ''),
                'name': person.get('name', ''),
                'middleName': person.get('middleName', ''),
                'birthPlace': person.get('birthPlace', ''),
                'birthDate': person.get('birthDate', '')
            }

            answer = self.parse_response(**query)

            if answer is None:
                continue

            score = self.compare_persons(query, answer)

            if score > self.trashhold and answer.get("information"):
                answer["information"] = self.summarize_information(answer["information"])
                result['matches'].append({
                    "data_id": idx,
                    "score": score,
                    "person": answer
                })
                result['matchedDataIds'].append(idx)

        return result


# ------------------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    payload = sys.stdin.read()
    if not payload:
        print(json.dumps({"matches": [], "matchedDataIds": []}))
        sys.exit(0)

    try:
        obj = json.loads(payload)
        data = obj.get("data")
        
        PN = PamyatNarodaParser(init_session=True, trashhold=90)
        result = PN.archive_search(data)
        
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"matches": [], "matchedDataIds": [], "error": str(e)}))
        sys.exit(1)
