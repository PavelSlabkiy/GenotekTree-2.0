import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  User, 
  Calendar, 
  MapPin, 
  X, 
  Edit2, 
  UserPlus, 
  Trash2,
  Heart,
  Baby,
  ChevronDown,
  Check,
  AlertTriangle,
  Home,
  HeartPulse,
  ThumbsUp,
  FileText,
  ClipboardList,
  Globe2,
  GitBranch,
  Briefcase,
  RefreshCw,
  TreePine,
  ChevronRight,
  Users
} from 'lucide-react';

const API_URL = '/api';

// Layout constants
const CARD_WIDTH = 140;
const CARD_HEIGHT = 110;
const HORIZONTAL_GAP = 50;
const VERTICAL_GAP = 100;
const COUPLE_GAP = 80;
const PADDING = 60;

// Helper function to format date
const formatDate = (dateStr) => {
  if (!dateStr) return 'Не указана';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
};

// Get full name
const getFullName = (person) => {
  if (!person) return '';
  return `${person.lastName || ''} ${person.name || ''} ${person.middleName || ''}`.trim();
};

// ============================================
// TREE LAYOUT ENGINE
// ============================================

class TreeLayoutEngine {
  constructor(people) {
    this.people = people;
    this.positions = new Map(); // personId -> { x, y }
    this.generations = new Map(); // personId -> generation level (0 = youngest)
  }

  // Calculate generation for each person (0 = youngest/leaves, higher = older)
  calculateGenerations() {
    const people = Object.values(this.people);
    if (people.length === 0) return;

    // Calculate generation based on descendants (bottom-up)
    const getGeneration = (personId, visited = new Set()) => {
      if (visited.has(personId)) return 0;
      visited.add(personId);
      
      if (this.generations.has(personId)) {
        return this.generations.get(personId);
      }

      const person = this.people[personId];
      if (!person) return 0;

      // Get all children
      const children = (person.children || [])
        .map(id => this.people[id])
        .filter(Boolean);

      if (children.length === 0) {
        // Leaf node - generation 0
        this.generations.set(personId, 0);
        return 0;
      }

      // Generation is 1 + max of children's generations
      let maxChildGen = 0;
      children.forEach(child => {
        maxChildGen = Math.max(maxChildGen, getGeneration(child.id, new Set(visited)));
      });

      const gen = maxChildGen + 1;
      this.generations.set(personId, gen);
      return gen;
    };

    // First pass - calculate based on children
    people.forEach(p => getGeneration(p.id));

    // Ensure partners are on the same generation (take the higher one)
    people.forEach(person => {
      if (person.partnerId && this.people[person.partnerId]) {
        const personGen = this.generations.get(person.id) || 0;
        const partnerGen = this.generations.get(person.partnerId) || 0;
        const maxGen = Math.max(personGen, partnerGen);
        this.generations.set(person.id, maxGen);
        this.generations.set(person.partnerId, maxGen);
      }
    });

    // Also check parent relationships to ensure consistency
    people.forEach(person => {
      const father = person.fatherId ? this.people[person.fatherId] : null;
      const mother = person.motherId ? this.people[person.motherId] : null;
      const personGen = this.generations.get(person.id) || 0;
      
      if (father) {
        const fatherGen = this.generations.get(father.id) || 0;
        if (fatherGen <= personGen) {
          this.generations.set(father.id, personGen + 1);
        }
      }
      if (mother) {
        const motherGen = this.generations.get(mother.id) || 0;
        if (motherGen <= personGen) {
          this.generations.set(mother.id, personGen + 1);
        }
      }
    });

    // Final pass - ensure partners match after parent adjustments
    people.forEach(person => {
      if (person.partnerId && this.people[person.partnerId]) {
        const personGen = this.generations.get(person.id) || 0;
        const partnerGen = this.generations.get(person.partnerId) || 0;
        const maxGen = Math.max(personGen, partnerGen);
        this.generations.set(person.id, maxGen);
        this.generations.set(person.partnerId, maxGen);
      }
    });
  }

  // Get children of a person (or couple)
  getChildren(person1, person2 = null) {
    const childrenIds = new Set(person1?.children || []);
    if (person2) {
      (person2.children || []).forEach(id => childrenIds.add(id));
    }
    
    return Array.from(childrenIds)
      .map(id => this.people[id])
      .filter(Boolean)
      .sort((a, b) => {
        if (a.birthDate && b.birthDate) {
          return new Date(a.birthDate) - new Date(b.birthDate);
        }
        return 0;
      });
  }

  // Get parents of a person
  getParents(person) {
    const parents = [];
    if (person.fatherId && this.people[person.fatherId]) {
      parents.push(this.people[person.fatherId]);
    }
    if (person.motherId && this.people[person.motherId]) {
      parents.push(this.people[person.motherId]);
    }
    return parents;
  }

  // Calculate the width needed for a couple (or single person with ancestors)
  getCoupleWidth(person1, person2 = null) {
    if (person2) {
      // Couple width is at least the two cards plus gap
      return CARD_WIDTH * 2 + COUPLE_GAP;
    }
    return CARD_WIDTH;
  }

  // Calculate the full tree width needed (ancestors + descendants) for a person
  getFullTreeWidth(personId, visited = new Set()) {
    if (visited.has(personId)) return CARD_WIDTH;
    visited.add(personId);

    const person = this.people[personId];
    if (!person) return CARD_WIDTH;

    // Get partner for couple width
    const partner = person.partnerId ? this.people[person.partnerId] : null;
    const coupleWidth = this.getCoupleWidth(person, partner);
    
    if (partner) {
      visited.add(partner.id);
    }

    // Calculate ancestor width
    const father = person.fatherId ? this.people[person.fatherId] : null;
    const mother = person.motherId ? this.people[person.motherId] : null;
    
    let ancestorWidth = coupleWidth;
    if (father && mother) {
      // Need space for both parents' full trees
      const fatherWidth = this.getFullTreeWidth(father.id, new Set(visited));
      const motherWidth = this.getFullTreeWidth(mother.id, new Set(visited));
      ancestorWidth = Math.max(ancestorWidth, fatherWidth + HORIZONTAL_GAP + motherWidth);
    } else if (father || mother) {
      const parentWidth = this.getFullTreeWidth((father || mother).id, new Set(visited));
      ancestorWidth = Math.max(ancestorWidth, parentWidth);
    }

    // Calculate descendant width (for partner's ancestors too)
    let partnerAncestorWidth = 0;
    if (partner) {
      const partnerFather = partner.fatherId ? this.people[partner.fatherId] : null;
      const partnerMother = partner.motherId ? this.people[partner.motherId] : null;
      
      if (partnerFather && partnerMother) {
        const pFatherWidth = this.getFullTreeWidth(partnerFather.id, new Set(visited));
        const pMotherWidth = this.getFullTreeWidth(partnerMother.id, new Set(visited));
        partnerAncestorWidth = pFatherWidth + HORIZONTAL_GAP + pMotherWidth;
      } else if (partnerFather || partnerMother) {
        partnerAncestorWidth = this.getFullTreeWidth((partnerFather || partnerMother).id, new Set(visited));
      }
    }

    // Total width is max of own ancestors + partner ancestors (since they're side by side)
    return Math.max(ancestorWidth + (partnerAncestorWidth > 0 ? HORIZONTAL_GAP + partnerAncestorWidth : 0), coupleWidth);
  }

  // Main layout calculation - TOP-DOWN approach
  calculateLayout() {
    this.calculateGenerations();

    const people = Object.values(this.people);
    if (people.length === 0) return;

    // Group by generation
    const generationGroups = new Map();
    this.generations.forEach((gen, personId) => {
      if (!generationGroups.has(gen)) {
        generationGroups.set(gen, new Set());
      }
      generationGroups.get(gen).add(personId);
    });

    const maxGen = Math.max(...Array.from(this.generations.values()));
    const positioned = new Set();

    // STEP 1: Find and position the oldest generation (roots) first
    const oldestGenPeople = Array.from(generationGroups.get(maxGen) || [])
      .map(id => this.people[id])
      .filter(Boolean);

    let currentX = PADDING;
    const topY = PADDING;

    // Group oldest generation into couples
    const processedOldest = new Set();
    const oldestUnits = [];

    oldestGenPeople.forEach(person => {
      if (processedOldest.has(person.id)) return;
      
      const partner = person.partnerId ? this.people[person.partnerId] : null;
      const partnerSameGen = partner && this.generations.get(partner.id) === maxGen;

      if (partnerSameGen && !processedOldest.has(partner.id)) {
        oldestUnits.push({ type: 'couple', person1: person, person2: partner });
        processedOldest.add(person.id);
        processedOldest.add(partner.id);
      } else if (!processedOldest.has(person.id)) {
        oldestUnits.push({ type: 'single', person: person });
        processedOldest.add(person.id);
      }
    });

    // Position oldest generation units
    oldestUnits.forEach((unit, index) => {
      if (index > 0) currentX += HORIZONTAL_GAP * 2;
      
      if (unit.type === 'couple') {
        const { person1, person2 } = unit;
        const coupleWidth = CARD_WIDTH * 2 + COUPLE_GAP;
        const centerX = currentX + coupleWidth / 2;
        
        this.positions.set(person1.id, { x: centerX - COUPLE_GAP / 2 - CARD_WIDTH / 2, y: topY });
        this.positions.set(person2.id, { x: centerX + COUPLE_GAP / 2 + CARD_WIDTH / 2, y: topY });
        positioned.add(person1.id);
        positioned.add(person2.id);
        currentX += coupleWidth;
      } else {
        this.positions.set(unit.person.id, { x: currentX + CARD_WIDTH / 2, y: topY });
        positioned.add(unit.person.id);
        currentX += CARD_WIDTH;
      }
    });

    // STEP 2: Position each lower generation centered below their parents
    for (let gen = maxGen - 1; gen >= 0; gen--) {
      const genY = (maxGen - gen) * (CARD_HEIGHT + VERTICAL_GAP) + PADDING;
      const genPeople = Array.from(generationGroups.get(gen) || [])
        .map(id => this.people[id])
        .filter(Boolean);

      // Group into couples first
      const processedInGen = new Set();
      const units = [];

      genPeople.forEach(person => {
        if (processedInGen.has(person.id)) return;
        
        const partner = person.partnerId ? this.people[person.partnerId] : null;
        const partnerSameGen = partner && this.generations.get(partner.id) === gen;

        if (partnerSameGen && !processedInGen.has(partner.id)) {
          units.push({ type: 'couple', person1: person, person2: partner });
          processedInGen.add(person.id);
          processedInGen.add(partner.id);
        } else if (!processedInGen.has(person.id)) {
          units.push({ type: 'single', person: person });
          processedInGen.add(person.id);
        }
      });

      // Position each unit
      units.forEach(unit => {
        if (unit.type === 'couple') {
          const { person1, person2 } = unit;
          if (positioned.has(person1.id) && positioned.has(person2.id)) return;

          // Find parents for person1 and person2
          const p1Father = person1.fatherId ? this.people[person1.fatherId] : null;
          const p1Mother = person1.motherId ? this.people[person1.motherId] : null;
          const p2Father = person2.fatherId ? this.people[person2.fatherId] : null;
          const p2Mother = person2.motherId ? this.people[person2.motherId] : null;

          // Calculate position based on parents
          let person1X, person2X;

          if ((p1Father || p1Mother) && positioned.has((p1Father || p1Mother).id)) {
            // Person1 has positioned parents - center under them
            const parentPositions = [p1Father, p1Mother]
              .filter(p => p && positioned.has(p.id))
              .map(p => this.positions.get(p.id).x);
            person1X = parentPositions.reduce((a, b) => a + b, 0) / parentPositions.length;
          }

          if ((p2Father || p2Mother) && positioned.has((p2Father || p2Mother).id)) {
            // Person2 has positioned parents - center under them
            const parentPositions = [p2Father, p2Mother]
              .filter(p => p && positioned.has(p.id))
              .map(p => this.positions.get(p.id).x);
            person2X = parentPositions.reduce((a, b) => a + b, 0) / parentPositions.length;
          }

          // If both have parent positions, use them; otherwise estimate
          if (person1X !== undefined && person2X !== undefined) {
            // Ensure minimum couple gap
            if (person2X - person1X < CARD_WIDTH + COUPLE_GAP) {
              const midX = (person1X + person2X) / 2;
              person1X = midX - COUPLE_GAP / 2 - CARD_WIDTH / 2;
              person2X = midX + COUPLE_GAP / 2 + CARD_WIDTH / 2;
            }
            this.positions.set(person1.id, { x: person1X, y: genY });
            this.positions.set(person2.id, { x: person2X, y: genY });
          } else if (person1X !== undefined) {
            this.positions.set(person1.id, { x: person1X, y: genY });
            this.positions.set(person2.id, { x: person1X + CARD_WIDTH + COUPLE_GAP, y: genY });
          } else if (person2X !== undefined) {
            this.positions.set(person1.id, { x: person2X - CARD_WIDTH - COUPLE_GAP, y: genY });
            this.positions.set(person2.id, { x: person2X, y: genY });
          } else {
            // No parents positioned, place based on current max X
            let maxX = PADDING;
            this.positions.forEach(pos => maxX = Math.max(maxX, pos.x + CARD_WIDTH / 2));
            this.positions.set(person1.id, { x: maxX + HORIZONTAL_GAP + CARD_WIDTH / 2, y: genY });
            this.positions.set(person2.id, { x: maxX + HORIZONTAL_GAP + CARD_WIDTH * 1.5 + COUPLE_GAP, y: genY });
          }

          positioned.add(person1.id);
          positioned.add(person2.id);
        } else {
          const person = unit.person;
          if (positioned.has(person.id)) return;

          const father = person.fatherId ? this.people[person.fatherId] : null;
          const mother = person.motherId ? this.people[person.motherId] : null;

          if ((father || mother) && positioned.has((father || mother).id)) {
            const parentPositions = [father, mother]
              .filter(p => p && positioned.has(p.id))
              .map(p => this.positions.get(p.id).x);
            const centerX = parentPositions.reduce((a, b) => a + b, 0) / parentPositions.length;
            this.positions.set(person.id, { x: centerX, y: genY });
          } else {
            let maxX = PADDING;
            this.positions.forEach(pos => maxX = Math.max(maxX, pos.x + CARD_WIDTH / 2));
            this.positions.set(person.id, { x: maxX + HORIZONTAL_GAP + CARD_WIDTH / 2, y: genY });
          }

          positioned.add(person.id);
        }
      });
    }
  }

  // Get calculated layout with normalized positions
  getLayout() {
    this.calculateLayout();
    
    if (this.positions.size === 0) {
      return { positions: new Map(), canvasWidth: PADDING * 2, canvasHeight: PADDING * 2 };
    }

    // Normalize positions to ensure no negative values and proper padding
    let minX = Infinity;
    let minY = Infinity;
    
    this.positions.forEach(pos => {
      minX = Math.min(minX, pos.x - CARD_WIDTH / 2);
      minY = Math.min(minY, pos.y);
    });

    const offsetX = PADDING - minX;
    const offsetY = PADDING - minY;

    const normalizedPositions = new Map();
    this.positions.forEach((pos, id) => {
      normalizedPositions.set(id, {
        x: pos.x + offsetX,
        y: pos.y + offsetY
      });
    });

    // Calculate canvas size
    let maxX = 0;
    let maxY = 0;
    
    normalizedPositions.forEach(pos => {
      maxX = Math.max(maxX, pos.x + CARD_WIDTH / 2);
      maxY = Math.max(maxY, pos.y + CARD_HEIGHT);
    });

    return {
      positions: normalizedPositions,
      canvasWidth: maxX + PADDING,
      canvasHeight: maxY + PADDING
    };
  }
}

// ============================================
// CONNECTOR LINES COMPONENT
// ============================================

const TreeConnectors = ({ people, positions, width, height }) => {
  const lines = useMemo(() => {
    const connectorLines = [];
    const processedCouples = new Set();
    const processedParentChild = new Set();

    Object.values(people).forEach(person => {
      const personPos = positions.get(person.id);
      if (!personPos) return;

      // Partner connection line
      if (person.partnerId && people[person.partnerId]) {
        const coupleKey = [person.id, person.partnerId].sort().join('-');
        if (!processedCouples.has(coupleKey)) {
          processedCouples.add(coupleKey);
          
          const partnerPos = positions.get(person.partnerId);
          if (partnerPos) {
            const y = personPos.y + CARD_HEIGHT / 2;
            connectorLines.push({
              type: 'couple',
              key: `couple-${coupleKey}`,
              x1: Math.min(personPos.x, partnerPos.x),
              y1: y,
              x2: Math.max(personPos.x, partnerPos.x),
              y2: y
            });

            // Children connector from couple
            const partner = people[person.partnerId];
            const childrenIds = new Set([
              ...(person.children || []),
              ...(partner.children || [])
            ]);

            const children = Array.from(childrenIds)
              .map(id => people[id])
              .filter(child => child && positions.has(child.id));

            if (children.length > 0) {
              const coupleCenterX = (personPos.x + partnerPos.x) / 2;
              const coupleCenterY = y;
              const childY = Math.min(...children.map(c => positions.get(c.id).y));
              const branchY = coupleCenterY + (childY - coupleCenterY - CARD_HEIGHT) / 2 + CARD_HEIGHT / 2;

              // Vertical line from couple to branch point
              connectorLines.push({
                type: 'vertical',
                key: `couple-down-${coupleKey}`,
                x1: coupleCenterX,
                y1: coupleCenterY,
                x2: coupleCenterX,
                y2: branchY
              });

              if (children.length === 1) {
                // Single child - straight line down
                const childPos = positions.get(children[0].id);
                connectorLines.push({
                  type: 'vertical',
                  key: `child-${children[0].id}`,
                  x1: coupleCenterX,
                  y1: branchY,
                  x2: childPos.x,
                  y2: childPos.y
                });
              } else {
                // Multiple children - horizontal branch then down to each
                const childXPositions = children.map(c => positions.get(c.id).x);
                const leftX = Math.min(...childXPositions);
                const rightX = Math.max(...childXPositions);

                // Horizontal branch line
                connectorLines.push({
                  type: 'horizontal',
                  key: `branch-${coupleKey}`,
                  x1: leftX,
                  y1: branchY,
                  x2: rightX,
                  y2: branchY
                });

                // Vertical lines to each child
                children.forEach(child => {
                  const childPos = positions.get(child.id);
                  const pKey = `parent-child-${coupleKey}-${child.id}`;
                  if (!processedParentChild.has(pKey)) {
                    processedParentChild.add(pKey);
                    connectorLines.push({
                      type: 'vertical',
                      key: `to-child-${child.id}`,
                      x1: childPos.x,
                      y1: branchY,
                      x2: childPos.x,
                      y2: childPos.y
                    });
                  }
                });
              }
            }
          }
        }
      } else if (!person.partnerId) {
        // Single parent with children
        const children = (person.children || [])
          .map(id => people[id])
          .filter(child => child && positions.has(child.id));

        if (children.length > 0) {
          const parentKey = `single-${person.id}`;
          if (!processedCouples.has(parentKey)) {
            processedCouples.add(parentKey);

            const parentCenterY = personPos.y + CARD_HEIGHT / 2;
            const childY = Math.min(...children.map(c => positions.get(c.id).y));
            const branchY = parentCenterY + (childY - parentCenterY - CARD_HEIGHT) / 2 + CARD_HEIGHT / 2;

            // Vertical line from parent to branch
            connectorLines.push({
              type: 'vertical',
              key: `single-down-${person.id}`,
              x1: personPos.x,
              y1: personPos.y + CARD_HEIGHT,
              x2: personPos.x,
              y2: branchY
            });

            if (children.length === 1) {
              const childPos = positions.get(children[0].id);
              connectorLines.push({
                type: 'vertical',
                key: `single-child-${children[0].id}`,
                x1: personPos.x,
                y1: branchY,
                x2: childPos.x,
                y2: childPos.y
              });
            } else {
              const childXPositions = children.map(c => positions.get(c.id).x);
              const leftX = Math.min(...childXPositions);
              const rightX = Math.max(...childXPositions);

              connectorLines.push({
                type: 'horizontal',
                key: `single-branch-${person.id}`,
                x1: leftX,
                y1: branchY,
                x2: rightX,
                y2: branchY
              });

              children.forEach(child => {
                const childPos = positions.get(child.id);
                connectorLines.push({
                  type: 'vertical',
                  key: `single-to-child-${child.id}`,
                  x1: childPos.x,
                  y1: branchY,
                  x2: childPos.x,
                  y2: childPos.y
                });
              });
            }
          }
        }
      }
    });

    return connectorLines;
  }, [people, positions]);

  return (
    <svg className="tree-connectors" width={width} height={height}>
      {lines.map(line => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
};

// ============================================
// PERSON NODE COMPONENT
// ============================================

const PersonNode = ({ person, position, isSelected, onClick, onMatchClick }) => {
  const fullName = getFullName(person);
  const birthYear = person.birthDate ? new Date(person.birthDate).getFullYear() : null;

  const handleMatchClick = (e) => {
    e.stopPropagation();
    if (onMatchClick) {
      onMatchClick(person);
    }
  };

  return (
    <div 
      className={`person-node ${person.gender} ${isSelected ? 'selected' : ''}`}
      style={{
        left: position.x,
        top: position.y
      }}
      onClick={() => onClick(person)}
    >
      {person.hasMatch && (
        <button 
          className="match-indicator"
          onClick={handleMatchClick}
          title="Найдено совпадение"
        >
          <RefreshCw size={14} />
        </button>
      )}
      <div className="person-avatar">
        <User size={20} />
      </div>
      <div className="person-name">{fullName || 'Без имени'}</div>
      {birthYear && <div className="person-dates">{birthYear}</div>}
    </div>
  );
};

// ============================================
// FAMILY TREE COMPONENT
// ============================================

const FamilyTree = ({ people, selectedPerson, onSelectPerson, onMatchClick }) => {
  const layout = useMemo(() => {
    const engine = new TreeLayoutEngine(people);
    return engine.getLayout();
  }, [people]);

  const peopleArray = Object.values(people);

  if (peopleArray.length === 0) {
    return (
      <div className="empty-state">
        <TreePine size={80} />
        <h2>Семейное древо пусто</h2>
        <p>Начните добавлять членов семьи</p>
      </div>
    );
  }

  return (
    <div 
      className="tree-canvas" 
      style={{ 
        width: layout.canvasWidth, 
        height: layout.canvasHeight
      }}
    >
      <TreeConnectors 
        people={people}
        positions={layout.positions}
        width={layout.canvasWidth}
        height={layout.canvasHeight}
      />
      <div className="tree-nodes">
        {peopleArray.map(person => {
          const position = layout.positions.get(person.id);
          if (!position) return null;

          return (
            <PersonNode
              key={person.id}
              person={person}
              position={position}
              isSelected={selectedPerson?.id === person.id}
              onClick={onSelectPerson}
              onMatchClick={onMatchClick}
            />
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// MODAL COMPONENTS
// ============================================

// Toast Component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast ${type}`}>
      <div className="toast-icon">
        {type === 'success' ? <Check size={20} /> : <AlertTriangle size={20} />}
      </div>
      <span className="toast-message">{message}</span>
    </div>
  );
};

// Confirm Dialog Component
const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay confirm-dialog" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="confirm-dialog-body">
          <div className="confirm-icon">
            <AlertTriangle size={28} />
          </div>
          <h3 className="confirm-title">{title}</h3>
          <p className="confirm-message">{message}</p>
        </div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
};

// Edit Person Modal
const EditModal = ({ isOpen, person, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    lastName: '',
    middleName: '',
    birthDate: '',
    birthPlace: '',
    information: ''
  });

  useEffect(() => {
    if (person) {
      setFormData({
        name: person.name || '',
        lastName: person.lastName || '',
        middleName: person.middleName || '',
        birthDate: person.birthDate || '',
        birthPlace: person.birthPlace || '',
        information: person.information || ''
      });
    }
  }, [person]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay edit-modal" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="edit-modal-header">
          <h3 className="edit-modal-title">Редактировать</h3>
          <button className="card-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="edit-modal-body">
            <div className="form-group">
              <label className="form-label">Фамилия</label>
              <input
                type="text"
                className="form-input"
                value={formData.lastName}
                onChange={e => setFormData({...formData, lastName: e.target.value})}
                placeholder="Введите фамилию"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Имя</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Введите имя"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Отчество</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.middleName}
                  onChange={e => setFormData({...formData, middleName: e.target.value})}
                  placeholder="Введите отчество"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Дата рождения</label>
              <input
                type="date"
                className="form-input"
                value={formData.birthDate}
                onChange={e => setFormData({...formData, birthDate: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Место рождения</label>
              <input
                type="text"
                className="form-input"
                value={formData.birthPlace}
                onChange={e => setFormData({...formData, birthPlace: e.target.value})}
                placeholder="Введите место рождения"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Описание</label>
              <textarea
                className="form-input form-textarea"
                value={formData.information}
                onChange={e => setFormData({...formData, information: e.target.value})}
                placeholder="Введите описание"
                rows={4}
              />
            </div>
          </div>
          <div className="edit-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Add Relative Modal
const AddRelativeModal = ({ isOpen, person, availableRelations, initialRelation, onAdd, onClose }) => {
  const [selectedRelation, setSelectedRelation] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    lastName: '',
    middleName: '',
    birthDate: '',
    birthPlace: ''
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedRelation(initialRelation || (availableRelations?.[0] || null));
      setFormData({
        name: '',
        lastName: '',
        middleName: '',
        birthDate: '',
        birthPlace: ''
      });
    }
  }, [isOpen, initialRelation, availableRelations]);

  if (!isOpen) return null;

  const relationLabels = {
    partner: { label: 'Партнёр', icon: Heart },
    father: { label: 'Отец', icon: User },
    mother: { label: 'Мать', icon: User },
    son: { label: 'Сын', icon: Baby },
    daughter: { label: 'Дочь', icon: Baby }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedRelation) {
      onAdd(selectedRelation, formData);
    }
  };

  return (
    <div className="modal-overlay edit-modal" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="edit-modal-header">
          <h3 className="edit-modal-title">Добавить родственника</h3>
          <button className="card-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="edit-modal-body">
            {selectedRelation ? (
              <>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  marginBottom: '20px',
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '8px'
                }}>
                  {(() => {
                    const { label, icon: Icon } = relationLabels[selectedRelation];
                    return (
                      <>
                        <Icon size={18} />
                        <span style={{ fontSize: '0.9rem' }}>Добавление: {label}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="form-group">
                  <label className="form-label">Фамилия</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.lastName}
                    onChange={e => setFormData({...formData, lastName: e.target.value})}
                    placeholder="Введите фамилию"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Имя</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Введите имя"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.middleName}
                      onChange={e => setFormData({...formData, middleName: e.target.value})}
                      placeholder="Введите отчество"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Дата рождения</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.birthDate}
                    onChange={e => setFormData({...formData, birthDate: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Место рождения</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.birthPlace}
                    onChange={e => setFormData({...formData, birthPlace: e.target.value})}
                    placeholder="Введите место рождения"
                  />
                </div>
              </>
            ) : null}
          </div>
          <div className="edit-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            {selectedRelation && (
              <button type="submit" className="btn btn-primary">
                Добавить
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

// Person Card Modal
const PersonCard = ({ person, people, onClose, onEdit, onAddRelative, onDelete, onSelectPerson }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  if (!person) return null;

  const fullName = getFullName(person);
  
  // Get family members
  const partner = person.partnerId ? people[person.partnerId] : null;
  const father = person.fatherId ? people[person.fatherId] : null;
  const mother = person.motherId ? people[person.motherId] : null;
  const children = (person.children || []).map(id => people[id]).filter(Boolean);
  
  // Get siblings
  const siblings = Object.values(people).filter(p => {
    if (p.id === person.id) return false;
    const sameFather = person.fatherId && p.fatherId === person.fatherId;
    const sameMother = person.motherId && p.motherId === person.motherId;
    return sameFather || sameMother;
  });

  // Determine available relations to add
  const availableRelations = [];
  if (!partner) availableRelations.push('partner');
  if (!father) availableRelations.push('father');
  if (!mother) availableRelations.push('mother');
  availableRelations.push('son', 'daughter');

  const handleRelativeClick = (relativePerson) => {
    onSelectPerson(relativePerson);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content person-card" onClick={e => e.stopPropagation()}>
        <div className="card-header">
          <div className={`card-avatar ${person.gender}`}>
            <User size={28} />
          </div>
          <div className="card-title-section">
            <h2 className="card-name">{fullName || 'Без имени'}</h2>
            <p className="card-meta">
              {person.gender === 'male' ? 'Мужчина' : 'Женщина'}
            </p>
          </div>
          <button className="card-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className="card-body">
          <div className="card-actions-top">
            <div className="dropdown" style={{ position: 'relative' }}>
              <button 
                className="btn btn-add-relative"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <UserPlus size={16} />
                + Родственник
                <ChevronDown size={16} />
              </button>
              {showDropdown && (
                <div className="dropdown-menu" style={{ minWidth: '160px' }}>
                  {availableRelations.map(relation => (
                    <div 
                      key={relation}
                      className="dropdown-item"
                      onClick={() => {
                        setShowDropdown(false);
                        onAddRelative(relation);
                      }}
                    >
                      {relation === 'partner' && <><Heart size={16} /> Партнёр</>}
                      {relation === 'father' && <><User size={16} /> Отец</>}
                      {relation === 'mother' && <><User size={16} /> Мать</>}
                      {relation === 'son' && <><Baby size={16} /> Сын</>}
                      {relation === 'daughter' && <><Baby size={16} /> Дочь</>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="btn btn-edit-outline" onClick={onEdit}>
              <Edit2 size={16} />
              Редактировать
            </button>
          </div>

          <div className="card-section">
            <h4 className="card-section-title">Информация</h4>
            
            <div className="card-info-row">
              <div className="card-info-icon">
                <Calendar size={18} />
              </div>
              <div className="card-info-content">
                <p className="card-info-label">Дата рождения</p>
                <p className="card-info-value">{formatDate(person.birthDate)}</p>
              </div>
            </div>
            
            <div className="card-info-row">
              <div className="card-info-icon">
                <MapPin size={18} />
              </div>
              <div className="card-info-content">
                <p className="card-info-label">Место рождения</p>
                <p className="card-info-value">{person.birthPlace || 'Не указано'}</p>
              </div>
            </div>
          </div>

          {partner && (
            <div className="card-section">
              <h4 className="card-section-title">Супруг(а)</h4>
              <div className="relative-list">
                <span 
                  className={`relative-tag ${partner.gender}`}
                  onClick={() => handleRelativeClick(partner)}
                >
                  {getFullName(partner)}
                </span>
              </div>
            </div>
          )}

          {(father || mother) && (
            <div className="card-section">
              <h4 className="card-section-title">Родители</h4>
              <div className="relative-list">
                {father && (
                  <span 
                    className="relative-tag male"
                    onClick={() => handleRelativeClick(father)}
                  >
                    {getFullName(father)} (отец)
                  </span>
                )}
                {mother && (
                  <span 
                    className="relative-tag female"
                    onClick={() => handleRelativeClick(mother)}
                  >
                    {getFullName(mother)} (мать)
                  </span>
                )}
              </div>
            </div>
          )}

          {children.length > 0 && (
            <div className="card-section">
              <h4 className="card-section-title">Дети</h4>
              <div className="relative-list">
                {children.map(child => (
                  <span 
                    key={child.id}
                    className={`relative-tag ${child.gender}`}
                    onClick={() => handleRelativeClick(child)}
                  >
                    {getFullName(child)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {siblings.length > 0 && (
            <div className="card-section">
              <h4 className="card-section-title">Братья/Сёстры</h4>
              <div className="relative-list">
                {siblings.map(sibling => (
                  <span 
                    key={sibling.id}
                    className={`relative-tag ${sibling.gender}`}
                    onClick={() => handleRelativeClick(sibling)}
                  >
                    {getFullName(sibling)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {person.information && (
            <div className="card-section">
              <h4 className="card-section-title">Описание</h4>
              <p className="card-description">{person.information}</p>
            </div>
          )}
        </div>

        <div className="card-actions card-actions-bottom">
          <button className="btn btn-delete-ghost" onClick={onDelete}>
            <Trash2 size={16} />
            Удалить родственника
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MATCH VERIFICATION MODAL
// ============================================

const MatchVerificationModal = ({ 
  isOpen, 
  person, 
  treeMatches = [], 
  archiveMatches = [], 
  onConfirmTree, 
  onConfirmArchive, 
  onClose 
}) => {
  const [expandedMatch, setExpandedMatch] = useState(null);
  const [expandedArchive, setExpandedArchive] = useState(null);

  if (!isOpen || !person) return null;

  // Sort matches by score descending
  const sortedTreeMatches = [...(treeMatches || [])].sort((a, b) => b.score - a.score);
  const sortedArchiveMatches = [...(archiveMatches || [])].sort((a, b) => b.score - a.score);

  const hasAnyMatches = sortedTreeMatches.length > 0 || sortedArchiveMatches.length > 0;

  const toggleExpand = (matchIndex) => {
    setExpandedMatch(expandedMatch === matchIndex ? null : matchIndex);
  };

  const toggleArchiveExpand = (matchIndex) => {
    setExpandedArchive(expandedArchive === matchIndex ? null : matchIndex);
  };

  const getRelativesFromFragment = (match) => {
    if (!match.people) return [];
    const matchedPersonId = match.database_id;
    return Object.values(match.people).filter(p => p.id !== matchedPersonId);
  };

  return (
    <div className="modal-overlay match-modal" onClick={onClose}>
      <div className="modal-content match-verification-content" onClick={e => e.stopPropagation()}>
        <div className="edit-modal-header">
          <h3 className="edit-modal-title">Проверка совпадений</h3>
          <button className="card-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className="match-modal-body">
          {!hasAnyMatches ? (
            <p className="no-matches">Совпадения не найдены</p>
          ) : (
            <>
              {/* Tree matches section */}
              {sortedTreeMatches.length > 0 && (
                <div className="match-section">
                  <h4 className="match-section-title">Совпадения с деревьями других пользователей</h4>
                  {sortedTreeMatches.map((match, index) => {
                    const matchedPerson = match.people?.[match.database_id];
                    const relatives = getRelativesFromFragment(match);
                    const isExpanded = expandedMatch === index;

                    return (
                      <div key={`tree-${index}`} className="match-card">
                        <div className="match-comparison">
                          <div className="match-person current-person">
                            <h4 className="match-person-title">Ваше дерево</h4>
                            <div className="match-person-info">
                              <p className="match-name">{getFullName(person)}</p>
                              <p className="match-detail">
                                <Calendar size={14} />
                                {person.birthDate || 'Не указана'}
                              </p>
                              <p className="match-detail">
                                <MapPin size={14} />
                                {person.birthPlace || 'Не указано'}
                              </p>
                            </div>
                          </div>

                          <div className="match-arrow">
                            <RefreshCw size={24} />
                          </div>

                          <div className="match-person found-person">
                            <h4 className="match-person-title">Дерево: {match.tree_owner}</h4>
                            <div className="match-person-info">
                              <p className="match-name">{matchedPerson ? getFullName(matchedPerson) : 'Неизвестно'}</p>
                              <p className="match-detail">
                                <Calendar size={14} />
                                {matchedPerson?.birthDate || 'Не указана'}
                              </p>
                              <p className="match-detail">
                                <MapPin size={14} />
                                {matchedPerson?.birthPlace || 'Не указано'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="match-score">
                          <span className="score-label">Вероятность совпадения:</span>
                          <span className="score-value">{match.score?.toFixed(1)}%</span>
                        </div>

                        {relatives.length > 0 && (
                          <div className="match-relatives-section">
                            <button 
                              className="match-relatives-toggle"
                              onClick={() => toggleExpand(index)}
                            >
                              <Users size={16} />
                              <span>Родственники для добавления ({relatives.length})</span>
                              <ChevronRight 
                                size={16} 
                                className={`toggle-icon ${isExpanded ? 'expanded' : ''}`}
                              />
                            </button>
                            
                            {isExpanded && (
                              <div className="match-relatives-list">
                                {relatives.map((relative, relIndex) => (
                                  <div key={relIndex} className="match-relative-item">
                                    <p className="relative-name">{getFullName(relative)}</p>
                                    <p className="relative-detail">
                                      <Calendar size={12} />
                                      {relative.birthDate || 'Не указана'}
                                    </p>
                                    <p className="relative-detail">
                                      <MapPin size={12} />
                                      {relative.birthPlace || 'Не указано'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <button 
                          className="btn btn-primary match-confirm-btn"
                          onClick={() => onConfirmTree(match)}
                        >
                          <Check size={16} />
                          Подтвердить совпадение
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Archive matches section */}
              {sortedArchiveMatches.length > 0 && (
                <div className="match-section">
                  <h4 className="match-section-title archive-title">Совпадения с архивом «Память народа»</h4>
                  {sortedArchiveMatches.map((match, index) => {
                    const archivePerson = match.person;
                    const isExpanded = expandedArchive === index;

                    return (
                      <div key={`archive-${index}`} className="match-card archive-match-card">
                        <div className="match-comparison">
                          <div className="match-person current-person">
                            <h4 className="match-person-title">Ваше дерево</h4>
                            <div className="match-person-info">
                              <p className="match-name">{getFullName(person)}</p>
                              <p className="match-detail">
                                <Calendar size={14} />
                                {person.birthDate || 'Не указана'}
                              </p>
                              <p className="match-detail">
                                <MapPin size={14} />
                                {person.birthPlace || 'Не указано'}
                              </p>
                            </div>
                          </div>

                          <div className="match-arrow archive-arrow">
                            <RefreshCw size={24} />
                          </div>

                          <div className="match-person found-person archive-person">
                            <h4 className="match-person-title">Архив «Память народа»</h4>
                            <div className="match-person-info">
                              <p className="match-name">{archivePerson ? getFullName(archivePerson) : 'Неизвестно'}</p>
                              <p className="match-detail">
                                <Calendar size={14} />
                                {archivePerson?.birthDate || 'Не указана'}
                              </p>
                              <p className="match-detail">
                                <MapPin size={14} />
                                {archivePerson?.birthPlace || 'Не указано'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="match-score archive-score">
                          <span className="score-label">Вероятность совпадения:</span>
                          <span className="score-value">{match.score?.toFixed(1)}%</span>
                        </div>

                        {archivePerson?.information && (
                          <div className="match-relatives-section">
                            <button 
                              className="match-relatives-toggle"
                              onClick={() => toggleArchiveExpand(index)}
                            >
                              <FileText size={16} />
                              <span>Информация из архива</span>
                              <ChevronRight 
                                size={16} 
                                className={`toggle-icon ${isExpanded ? 'expanded' : ''}`}
                              />
                            </button>
                            
                            {isExpanded && (
                              <div className="match-archive-info">
                                <p className="archive-description">{archivePerson.information}</p>
                              </div>
                            )}
                          </div>
                        )}

                        <button 
                          className="btn btn-primary match-confirm-btn archive-confirm-btn"
                          onClick={() => onConfirmArchive(match)}
                        >
                          <Check size={16} />
                          Подтвердить совпадение
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN APP COMPONENT
// ============================================

function App() {
  const [people, setPeople] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddRelativeModal, setShowAddRelativeModal] = useState(false);
  const [availableRelations, setAvailableRelations] = useState([]);
  const [initialRelation, setInitialRelation] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchPerson, setMatchPerson] = useState(null);
  const [treeMatches, setTreeMatches] = useState([]);
  const [archiveMatches, setArchiveMatches] = useState([]);

  const sidebarNav = [
    { key: 'home', label: 'Главная', icon: Home },
    { key: 'health', label: 'Здоровье', icon: HeartPulse },
    { key: 'recommendations', label: 'Рекомендации', icon: ThumbsUp },
    { key: 'medcard', label: 'Медицинская карта', icon: FileText },
    { key: 'survey', label: 'Анкета', icon: ClipboardList },
    { key: 'origin', label: 'Происхождение', icon: Globe2 },
    { key: 'tree', label: 'Генеалогическое древо', icon: GitBranch },
    { key: 'services', label: 'Генеалогические услуги', icon: Briefcase },
    { key: 'pregnancy', label: 'Планирование беременности', icon: Baby }
  ];

  // Fetch people data
  const fetchPeople = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/people`);
      const data = await response.json();
      setPeople(data);
    } catch (error) {
      console.error('Error fetching people:', error);
      showToast('Ошибка загрузки данных', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  // Toast helper
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Handle person selection
  const handleSelectPerson = (person) => {
    setSelectedPerson(person);
  };

  // Handle edit
  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleSaveEdit = async (formData) => {
    try {
      const response = await fetch(`${API_URL}/people/${selectedPerson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        const updatedPerson = await response.json();
        setPeople(prev => ({
          ...prev,
          [updatedPerson.id]: updatedPerson
        }));
        setSelectedPerson(updatedPerson);
        setShowEditModal(false);
        showToast('Изменения сохранены');
        // Run smart matching after edit
        runSmartMatching();
      }
    } catch (error) {
      console.error('Error updating person:', error);
      showToast('Ошибка сохранения', 'error');
    }
  };

  // Handle add relative
  const handleAddRelative = (relation) => {
    setAvailableRelations([relation]);
    setInitialRelation(relation);
    setShowAddRelativeModal(true);
  };

  const handleSaveRelative = async (relationType, relativeData) => {
    try {
      const response = await fetch(`${API_URL}/people/${selectedPerson.id}/relative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationType, relativeData })
      });
      
      if (response.ok) {
        await fetchPeople();
        setShowAddRelativeModal(false);
        showToast('Родственник добавлен');
        // Run smart matching after adding relative
        runSmartMatching();
      }
    } catch (error) {
      console.error('Error adding relative:', error);
      showToast('Ошибка добавления', 'error');
    }
  };

  // Handle delete
  const handleDelete = () => {
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    try {
      const response = await fetch(`${API_URL}/people/${selectedPerson.id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await fetchPeople();
        setSelectedPerson(null);
        setShowConfirmDelete(false);
        showToast('Запись удалена');
      }
    } catch (error) {
      console.error('Error deleting person:', error);
      showToast('Ошибка удаления', 'error');
    }
  };

  // Handle adding new root person
  const handleAddNewPerson = async () => {
    try {
      const response = await fetch(`${API_URL}/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Новый',
          lastName: 'Человек',
          gender: 'male'
        })
      });
      
      if (response.ok) {
        const newPerson = await response.json();
        await fetchPeople();
        setSelectedPerson(newPerson);
        showToast('Человек добавлен');
      }
    } catch (error) {
      console.error('Error adding person:', error);
      showToast('Ошибка добавления', 'error');
    }
  };

  // Run smart matching
  const runSmartMatching = async () => {
    try {
      const response = await fetch(`${API_URL}/smart-matching`, {
        method: 'POST'
      });
      
      if (response.ok) {
        await fetchPeople(); // Refresh to get updated hasMatch flags
      }
    } catch (error) {
      console.error('Smart matching error:', error);
    }
  };

  // Handle match icon click - open match modal
  const handleMatchClick = async (person) => {
    try {
      setMatchPerson(person);
      const response = await fetch(`${API_URL}/people/${person.id}/matches`);
      
      if (response.ok) {
        const data = await response.json();
        setTreeMatches(data.treeMatches || []);
        setArchiveMatches(data.archiveMatches || []);
        setShowMatchModal(true);
      }
    } catch (error) {
      console.error('Error getting matches:', error);
      showToast('Ошибка загрузки совпадений', 'error');
    }
  };

  // Handle tree match confirmation
  const handleConfirmTreeMatch = async (match) => {
    try {
      const response = await fetch(`${API_URL}/people/${matchPerson.id}/confirm-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match })
      });
      
      if (response.ok) {
        await fetchPeople();
        setShowMatchModal(false);
        setMatchPerson(null);
        setTreeMatches([]);
        setArchiveMatches([]);
        showToast('Совпадение подтверждено, родственники добавлены');
        // Run smart matching again to find new matches
        await runSmartMatching();
      }
    } catch (error) {
      console.error('Error confirming match:', error);
      showToast('Ошибка подтверждения', 'error');
    }
  };

  // Handle archive match confirmation
  const handleConfirmArchiveMatch = async (match) => {
    try {
      const response = await fetch(`${API_URL}/people/${matchPerson.id}/confirm-archive-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match })
      });
      
      if (response.ok) {
        const data = await response.json();
        await fetchPeople();
        // Update selected person if it's the same
        if (selectedPerson?.id === matchPerson.id) {
          setSelectedPerson(data.person);
        }
        setShowMatchModal(false);
        setMatchPerson(null);
        setTreeMatches([]);
        setArchiveMatches([]);
        showToast('Информация из архива добавлена');
        // Run smart matching again
        await runSmartMatching();
      }
    } catch (error) {
      console.error('Error confirming archive match:', error);
      showToast('Ошибка подтверждения', 'error');
    }
  };

  // Run smart matching on initial load and after changes
  useEffect(() => {
    if (!loading && Object.keys(people).length > 0) {
      runSmartMatching();
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">Genotek</div>
        <nav className="sidebar-nav">
          {sidebarNav.map(item => {
            const Icon = item.icon;
            const isActive = item.key === 'tree';
            return (
              <button 
                key={item.key}
                type="button"
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="main-content">
        <div className="tree-container">
          <FamilyTree 
            people={people}
            selectedPerson={selectedPerson}
            onSelectPerson={handleSelectPerson}
            onMatchClick={handleMatchClick}
          />
        </div>
      </div>

      {selectedPerson && !showEditModal && !showAddRelativeModal && (
        <PersonCard
          person={selectedPerson}
          people={people}
          onClose={() => setSelectedPerson(null)}
          onEdit={handleEdit}
          onAddRelative={handleAddRelative}
          onDelete={handleDelete}
          onSelectPerson={handleSelectPerson}
        />
      )}

      <EditModal
        isOpen={showEditModal}
        person={selectedPerson}
        onSave={handleSaveEdit}
        onClose={() => setShowEditModal(false)}
      />

      <AddRelativeModal
        isOpen={showAddRelativeModal}
        person={selectedPerson}
        availableRelations={availableRelations}
        initialRelation={initialRelation}
        onAdd={handleSaveRelative}
        onClose={() => setShowAddRelativeModal(false)}
      />

      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Удалить запись?"
        message={`Вы уверены, что хотите удалить ${getFullName(selectedPerson)}? Это действие нельзя отменить.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirmDelete(false)}
      />

      <MatchVerificationModal
        isOpen={showMatchModal}
        person={matchPerson}
        treeMatches={treeMatches}
        archiveMatches={archiveMatches}
        onConfirmTree={handleConfirmTreeMatch}
        onConfirmArchive={handleConfirmArchiveMatch}
        onClose={() => {
          setShowMatchModal(false);
          setMatchPerson(null);
          setTreeMatches([]);
          setArchiveMatches([]);
        }}
      />

      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
