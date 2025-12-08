from rapidfuzz import fuzz
import json
import heapq
import sys

class SmartMatching:
    '''
    SmartMatching — поиск похожих людей во всех деревьях.
    Теперь возвращает список совпадений, и для каждого совпадения формируется отдельный people-фрагмент.
    '''
    def __init__(self, data, database, trashhold: int = 90, k: int = 1):
        self.data = data
        self.database = database
        self.trashhold = trashhold
        self.k = k

    # ----------------------------------------------------------------------
    def compare_idx2idx(self, idx1, idx2):
        lastname_score = fuzz.token_sort_ratio(idx1.get('lastName',''), idx2.get('lastName',''))
        name_score = fuzz.token_sort_ratio(idx1.get('name',''), idx2.get('name',''))
        middlename_score = fuzz.token_sort_ratio(idx1.get('middleName',''), idx2.get('middleName',''))
        pob_score = fuzz.token_sort_ratio(idx1.get('birthPlace',''), idx2.get('birthPlace',''))
        dob_score = fuzz.token_sort_ratio(idx1.get('birthDate',''), idx2.get('birthDate',''))
        isalive_score = 100 if str(idx1.get('isAlive')) == str(idx2.get('isAlive')) else 0

        score = (
            0.2*lastname_score +
            0.2*name_score +
            0.15*middlename_score +
            0.15*pob_score +
            0.15*dob_score +
            0.15*isalive_score
        )
        return score

    # ----------------------------------------------------------------------
    def get_oldest_generation_idx(self):
        data_json = json.loads(self.data)
        oldest_idx = []
        for person_id, person in data_json["people"].items():
            if person.get("fatherId") is None and person.get("motherId") is None:
                oldest_idx.append(person_id)
        return oldest_idx

    # ----------------------------------------------------------------------
    # Поиск совпадений во всех деревьях
    # ----------------------------------------------------------------------
    def parse_json(self):
        data_json = json.loads(self.data)
        database_json = json.loads(self.database)
        oldest_idx = self.get_oldest_generation_idx()

        scores_dict = {}

        for data_idx in oldest_idx:
            scores_list = []

            for tree_id, tree_data in database_json.get("tree_id", {}).items():
                people = tree_data.get("people", {})

                for db_id, db_person in people.items():

                    score = self.compare_idx2idx(data_json["people"][data_idx], db_person)
                    if score >= self.trashhold:
                        scores_list.append({
                            "data_id": data_idx,
                            "tree_id": tree_id,
                            "tree_owner": tree_data.get("tree_owner"),
                            "database_id": db_id,
                            "score": score
                        })

            scores_dict[data_idx] = scores_list

        return scores_dict

    # ----------------------------------------------------------------------
    def top_k_idx(self):
        k = self.k
        scores_dict = self.parse_json()

        pairs = [
            entry
            for _, entries in scores_dict.items()
            for entry in entries
        ]

        top_k = heapq.nlargest(k, pairs, key=lambda x: x["score"])
        return top_k

    # ----------------------------------------------------------------------
    # Формируем отдельный people-фрагмент для КАЖДОГО совпадения
    # ----------------------------------------------------------------------
    def get_older_generation_idx(self):
        top = self.top_k_idx()
        database_json = json.loads(self.database)

        matchedDataIds = list({t["data_id"] for t in top})

        results = []

        for match in top:
            tree_id = match["tree_id"]
            db_person_id = match["database_id"]

            people = database_json["tree_id"][tree_id]["people"]

            # если по какой-то причине нет — пропускаем
            if db_person_id not in people:
                continue

            # собираем предков именно для этого совпадения
            fragment_people = {}

            def collect_ancestors(pid):
                if pid is None or pid not in people:
                    return
                if pid in fragment_people:
                    return
                person = people[pid]
                fragment_people[pid] = person
                collect_ancestors(person.get("fatherId"))
                collect_ancestors(person.get("motherId"))

            collect_ancestors(db_person_id)

            # добавляем в общий список
            results.append({
                **match,
                "people": fragment_people
            })

        return {
            "matches": results,
            "matchedDataIds": matchedDataIds
        }


# ------------------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    payload = sys.stdin.read()
    if not payload:
        print(json.dumps({}))
        sys.exit(0)

    obj = json.loads(payload)
    data = obj.get("data")
    db = obj.get("db")

    SM = SmartMatching(data, db, trashhold=90, k=5)
    out = SM.get_older_generation_idx()

    print(json.dumps(out))