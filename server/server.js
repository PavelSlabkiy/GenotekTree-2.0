const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Path to data file
const DATA_FILE = path.join(__dirname, '..', 'data.json');

// Helper functions
const readData = () => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return { people: {} };
  }
};

const writeData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing data file:', error);
    return false;
  }
};

const generateId = () => {
  return Date.now().toString();
};

// API Routes

// Get all people
app.get('/api/people', (req, res) => {
  const data = readData();
  res.json(data.people);
});

// Get single person by ID
app.get('/api/people/:id', (req, res) => {
  const data = readData();
  const person = data.people[req.params.id];
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  res.json(person);
});

// Create new person
app.post('/api/people', (req, res) => {
  const data = readData();
  const newPerson = {
    id: req.body.id || generateId(),
    name: req.body.name || '',
    lastName: req.body.lastName || '',
    middleName: req.body.middleName || '',
    gender: req.body.gender || 'male',
    fatherId: req.body.fatherId || null,
    motherId: req.body.motherId || null,
    partnerId: req.body.partnerId || null,
    children: req.body.children || [],
    isAlive: req.body.isAlive !== undefined ? req.body.isAlive : true,
    birthDate: req.body.birthDate || '',
    birthPlace: req.body.birthPlace || '',
    hasMatch: req.body.hasMatch || false
  };
  
  data.people[newPerson.id] = newPerson;
  
  if (writeData(data)) {
    res.status(201).json(newPerson);
  } else {
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// Update person
app.put('/api/people/:id', (req, res) => {
  const data = readData();
  const person = data.people[req.params.id];
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  // Update person fields
  const updatedPerson = {
    ...person,
    ...req.body,
    id: req.params.id // Ensure ID doesn't change
  };
  
  data.people[req.params.id] = updatedPerson;
  
  if (writeData(data)) {
    res.json(updatedPerson);
  } else {
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// Delete person
app.delete('/api/people/:id', (req, res) => {
  const data = readData();
  const personId = req.params.id;
  const person = data.people[personId];
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  // Remove references to this person from other people
  Object.values(data.people).forEach((p) => {
    // Remove from partner
    if (p.partnerId === personId) {
      p.partnerId = null;
    }
    
    // Remove from parent references
    if (p.fatherId === personId) {
      p.fatherId = null;
    }
    if (p.motherId === personId) {
      p.motherId = null;
    }
    
    // Remove from children arrays
    if (p.children && p.children.includes(personId)) {
      p.children = p.children.filter(id => id !== personId);
    }
  });
  
  // Delete the person
  delete data.people[personId];
  
  if (writeData(data)) {
    res.json({ success: true, message: 'Person deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// Add relative to a person
app.post('/api/people/:id/relative', (req, res) => {
  const data = readData();
  const personId = req.params.id;
  const person = data.people[personId];
  const { relationType, relativeData } = req.body;
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  const newRelativeId = generateId();
  const newRelative = {
    id: newRelativeId,
    name: relativeData.name || '',
    lastName: relativeData.lastName || '',
    middleName: relativeData.middleName || '',
    gender: relativeData.gender || 'male',
    fatherId: null,
    motherId: null,
    partnerId: null,
    children: [],
    isAlive: true,
    birthDate: relativeData.birthDate || '',
    birthPlace: relativeData.birthPlace || '',
    hasMatch: false
  };
  
  switch (relationType) {
    case 'partner':
      newRelative.gender = person.gender === 'male' ? 'female' : 'male';
      newRelative.partnerId = personId;
      newRelative.children = [...(person.children || [])];
      person.partnerId = newRelativeId;
      break;
      
    case 'father':
      newRelative.gender = 'male';
      if (!newRelative.children.includes(personId)) {
        newRelative.children.push(personId);
      }
      person.fatherId = newRelativeId;
      // If mother exists, link father as partner
      if (person.motherId && data.people[person.motherId]) {
        newRelative.partnerId = person.motherId;
        data.people[person.motherId].partnerId = newRelativeId;
      }
      break;
      
    case 'mother':
      newRelative.gender = 'female';
      if (!newRelative.children.includes(personId)) {
        newRelative.children.push(personId);
      }
      person.motherId = newRelativeId;
      // If father exists, link mother as partner
      if (person.fatherId && data.people[person.fatherId]) {
        newRelative.partnerId = person.fatherId;
        data.people[person.fatherId].partnerId = newRelativeId;
      }
      break;
      
    case 'son':
      newRelative.gender = 'male';
      if (person.gender === 'male') {
        newRelative.fatherId = personId;
        if (person.partnerId) {
          newRelative.motherId = person.partnerId;
          if (data.people[person.partnerId]) {
            data.people[person.partnerId].children.push(newRelativeId);
          }
        }
      } else {
        newRelative.motherId = personId;
        if (person.partnerId) {
          newRelative.fatherId = person.partnerId;
          if (data.people[person.partnerId]) {
            data.people[person.partnerId].children.push(newRelativeId);
          }
        }
      }
      person.children.push(newRelativeId);
      break;
      
    case 'daughter':
      newRelative.gender = 'female';
      if (person.gender === 'male') {
        newRelative.fatherId = personId;
        if (person.partnerId) {
          newRelative.motherId = person.partnerId;
          if (data.people[person.partnerId]) {
            data.people[person.partnerId].children.push(newRelativeId);
          }
        }
      } else {
        newRelative.motherId = personId;
        if (person.partnerId) {
          newRelative.fatherId = person.partnerId;
          if (data.people[person.partnerId]) {
            data.people[person.partnerId].children.push(newRelativeId);
          }
        }
      }
      person.children.push(newRelativeId);
      break;
      
    default:
      return res.status(400).json({ error: 'Invalid relation type' });
  }
  
  data.people[newRelativeId] = newRelative;
  data.people[personId] = person;
  
  if (writeData(data)) {
    res.status(201).json({ person, newRelative });
  } else {
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// Get person with full family info (for card display)
app.get('/api/people/:id/family', (req, res) => {
  const data = readData();
  const person = data.people[req.params.id];
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  const getFullName = (p) => {
    if (!p) return null;
    return `${p.lastName || ''} ${p.name || ''} ${p.middleName || ''}`.trim();
  };
  
  const getPersonInfo = (id) => {
    const p = data.people[id];
    if (!p) return null;
    return {
      id: p.id,
      fullName: getFullName(p),
      gender: p.gender
    };
  };
  
  // Get siblings (people with same parents)
  const siblings = [];
  Object.values(data.people).forEach(p => {
    if (p.id !== person.id) {
      const samefather = person.fatherId && p.fatherId === person.fatherId;
      const sameMother = person.motherId && p.motherId === person.motherId;
      if (samefather || sameMother) {
        siblings.push(getPersonInfo(p.id));
      }
    }
  });
  
  const familyInfo = {
    ...person,
    fullName: getFullName(person),
    partner: person.partnerId ? getPersonInfo(person.partnerId) : null,
    father: person.fatherId ? getPersonInfo(person.fatherId) : null,
    mother: person.motherId ? getPersonInfo(person.motherId) : null,
    childrenInfo: (person.children || []).map(id => getPersonInfo(id)).filter(Boolean),
    siblings
  };
  
  res.json(familyInfo);
});

app.listen(PORT, () => {
  console.log(`🌳 Family Tree Server running on http://localhost:${PORT}`);
});
