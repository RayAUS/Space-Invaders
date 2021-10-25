import { fromEvent, interval, merge, ObjectUnsubscribedError, Observable, Subscription} from "rxjs";
import { map, filter, mergeMap, takeUntil, scan, first} from 'rxjs/operators';

function spaceinvaders(): void {  
  //Created as the general object for game objects such as ship
  type ObjectState = Readonly<{
    id:string,
    pos:Vec, 
    vel:Vec,
    radius:number,
    createTime:number
    row: number
  }>

  //Created as the general object for the game's state
  type State = Readonly<{
    time:number,
    ship:ObjectState,
    score: number,
    bullets:ReadonlyArray<ObjectState>,
    enemyBullets: ReadonlyArray<ObjectState>
    exit:ReadonlyArray<ObjectState>,
    enemies:ReadonlyArray<ObjectState>,
    objCount:number,
    gameOver: boolean
  }>

  type Constants = Readonly<{
    CANVAS_SIZE: number,
    BULLET_EXPIRIATION_TIME: number,
    BULLET_RADIUS: number,
    BULLET_VELOCITY: number,
    START_ENEMY_RADIUS: number,
    START_ENEMY_COUNT: number,
    START_TIME: number,
    KEYBOARD_MOVE_SPEED: number,
    ANGLE: number
  }>
  //This interface was made because to create enemies in the grid format I needed the columns for each, this extends ObjectState and polymorphism will deal with the rest
  interface Enemy extends ObjectState {
    col: number
  }
  //Play is called whenever a game starts
  play(0)

  /**Play function:
   * The play function is called whenever you progress to another level. It can be also used to restart game
   * Level is the level NUMBER you are at, this effects the amount of enemies that are being shot, and how fast they move up and how fast the bullets they shoot at you
   * This game was designed to be harder level by level.
  **/
  function play(level: number, player: State = null): void{

  //These are the constants for this play instance, it includes values that are used amounst the code to save time from hardcoding everthing
  const
    CONSTANTS = <Constants>{
      CANVAS_SIZE: document.getElementById("canvas").clientWidth,
      BULLET_EXPIRIATION_TIME: 39,
      BULLET_RADIUS: 3,
      BULLET_VELOCITY: 15,
      START_ENEMY_RADIUS: 20,
      START_ENEMY_COUNT: 5 + (level*2),
      START_TIME: 0,
      KEYBOARD_MOVE_SPEED: 6.5,
      ANGLE: 0
  },
  
  //Function creates an enemy with 3 curried inputs, enemies can be of various size, the game is already difficult when you reach higher levels, so I keep this implementation as it is better for further implementation
  createEnemy = (oid:number)=> (time:number)=> (radius:number): Enemy=> <Enemy>{
    id: "enemy"+oid,
    pos: Vec.Zero,
    vel: Vec.Zero,
    radius: radius,
    createTime: time,
    row: 0,
    col: oid
  },

  //This constant which points to a function which algorithm is what creates the enemy's positions at the start of the game
  gridValues = (o: Enemy): Enemy => <Enemy>{
    ...o,
    row: Math.ceil((o.col+1)/5),
    col: (o.col+1)%5,
    pos: new Vec(140 + 80*((o.col + 1)%5), 20 + 50*Math.ceil((o.col+1)/5))
  },
  //Creates a completed enemies array
  startEnemies: Array<ObjectState> = [...Array<ObjectState>(CONSTANTS.START_ENEMY_COUNT)]
    .map((_,i)=>gridValues(createEnemy(i)
      (CONSTANTS.START_TIME)(CONSTANTS.START_ENEMY_RADIUS))),

  //If player isn't passed through player function, creates the gameState object, but if it isn't, uses previous gameState object.
  gameState: State = player == null ? {
    time: CONSTANTS.START_TIME,
    ship: createShip(),
    score: 0,
    bullets: [],
    exit: [],
    enemies: startEnemies,
    enemyBullets: [],
    objCount: 0,
    gameOver: false
  }: {
    ...player,
    bullets: [],
    enemies: startEnemies,
    enemyBullets: []
  };

  //Creates ship object, the ship is hardcoded to the starting position when it is called but is updated with mouse and keyboard movements
  function createShip(): ObjectState {
    return {
      id: 'ship',
      pos: new Vec(270,540), 
      vel: Vec.Zero,
      radius: 25,
      createTime: CONSTANTS.START_TIME,
      row: 11
    }
  }
  function createBulletFromShip(s:State): ObjectState {
    const d: Vec = Vec.unitVecInDirection(CONSTANTS.ANGLE);
    return {
      id: `bullet${s.objCount}`,
      pos:s.ship.pos.add(d.scale(s.ship.radius)).add(new Vec(26,25)),
      vel:s.ship.vel.add(d.scale(-CONSTANTS.BULLET_VELOCITY)),
      radius:CONSTANTS.BULLET_RADIUS,
      createTime:s.time,
      row: null
    }
  }
  //Creates enemies object, these enemies have incorrect positions, columns and rows. This function with the use of the gridValues constant above creates a completed enemy object
  function createBulletFromEnemy(s: State, randValue: number): ObjectState {
    const d: Vec = Vec.unitVecInDirection(0)
    const enemy: ObjectState = s.enemies[Math.ceil(s.enemies.length*randValue) - 1]
    return {
      id: `bullet${s.objCount}`,
      pos: enemy.pos.add(d.scale(enemy.radius)).add(new Vec(10, 40)),
      vel: enemy.vel.add(d.scale(CONSTANTS.BULLET_VELOCITY - 12 + Math.log(level +1))),
      radius:CONSTANTS.BULLET_RADIUS,
      createTime:s.time,
      row: null
    }
  }

  //Tick class used to differentiate observable outputs
  class Tick {constructor(public readonly elapsed: number) {}}
  //Move class used to differentiate observable outputs
  class Move {constructor(public readonly value: number) {}}
  //ChangePosition class used to differentiate observable outputs
  class ChangePosition {constructor(public readonly value: number){}}
  //Shoot class used to differentiate observable outputs
  class Shoot {constructor() {}}
  //EnemyShoot class used to differentiate observable outputs
  class EnemyShoot {constructor() {}}
  //AltenateDirection class uses next value to have 2 outputs which swap, used as a class implementation to reduce dataleaks (this is used when the enemies move left or right and if they move sideways or downwards)
  class AltenateDirection {
    value: number;
    constructor(value: number)
    {this.value = value}
    nextValue(): number {
      this.value == 1 ? this.value = -1 : this.value = 1
      return this.value;
      }
    }
  //Checks if x,y inputs are inside the svg (used to see if mouse is in svg)
  function mouseInSVG(x: number,y: number): boolean{
    return x < 583 && x > 32 && y > 76 && y < 676;
  }

  //KeyBoardevent observable stream which outputs a new move class object whenever left/right arrow keys are pressed
  const keyboardMoveInput: Observable<Move> = fromEvent<KeyboardEvent>(document, 'keydown')
  .pipe(
    filter(({code})=>code === 'ArrowLeft' || code === 'ArrowRight'),
    filter(({repeat})=>!repeat),
    mergeMap(d=>interval(5).pipe(
      takeUntil(fromEvent<KeyboardEvent>(document, 'keyup').pipe(
        filter(({code})=>code === d.code)
      )),
      map(_=>d))
    ),
    map(({code})=>code==='ArrowLeft'?new Move(-CONSTANTS.KEYBOARD_MOVE_SPEED):new Move(CONSTANTS.KEYBOARD_MOVE_SPEED))),
  //KeyBoardevent observable stream which outputs a new shoot class object whenever the up arrow key is pressed
  keyboardShootInput: Observable<Shoot>= fromEvent<KeyboardEvent>(document, 'keydown')
  .pipe(
    filter(({code})=>code === 'ArrowUp'),
    filter(({repeat})=>!repeat),
    mergeMap(d=>interval(1).pipe(
      takeUntil(fromEvent<KeyboardEvent>(document, 'keyup').pipe(
        filter(({code})=>code === d.code)
      )),
      map(_=>new Shoot()))
    )),
  //MouseEvent observable stream which outputs a new ChangePosition class object whenever the mouse is moved IN the canvas SVG html element
  mouseMoveInput: Observable<Shoot> = fromEvent<MouseEvent>(document, 'mousemove')
  .pipe(
    filter(({x,y}) => mouseInSVG(x,y)),
    map(({x}) => new ChangePosition(x))),
  //MouseEvent observable stream which outputs a new Shoot class object whenever the mouse is pressed down IN the canvas SVG html element
  mouseShootInput = fromEvent<MouseEvent>(document, 'mousedown')
  .pipe(
    filter(({x,y}) => mouseInSVG(x,y)),
    map(_ => new Shoot())),
  //Interval observable stream which outputs a new Tick class object, the interval starts at around 10ish, but as the game progresses, and the levels get harder, the tick becomes faster which means enemy objects move faster. 
  tickInterval: Observable<Tick> = interval(10 - (Math.log(level +1)*2)).pipe(map(elapsed =>new Tick(elapsed))),
  //Interval observable stream which outputs a new EnemyShoot class object, the interval also becomes faster as the level gets harder. Also the enemiesshoot will be called with a ~50% chance whenever an observable is in the stream 
  enemyBullets: Observable<EnemyShoot> = interval(1000 - (Math.log(level +1)*120)).pipe(filter(event => Math.random() > 0.55),map(_=>new EnemyShoot())),


  //This function takes in the objects that the observable streams output and accordingly deals with them by identifying the classes, made sure if an object is created to increment object count
  reduceState = (s: State, e:Move|ChangePosition|Shoot|Tick): State=>
  e instanceof Move ? <State>{...s,
    ship: {...s.ship, pos: new Vec(s.ship.pos.x+e.value < CONSTANTS.CANVAS_SIZE-45 && s.ship.pos.x+e.value > 0 ? s.ship.pos.x+e.value: s.ship.pos.x, s.ship.pos.y)}
  }:
  e instanceof ChangePosition ? <State>{...s,
    ship: {...s.ship, pos: new Vec(e.value -32, s.ship.pos.y)}
  }:
  e instanceof Shoot ? <State>{...s,
    bullets: s.bullets.length ? s.bullets: s.bullets.concat([createBulletFromShip(s)]),
    objCount: s.objCount + 1
  }:
  e instanceof EnemyShoot ? <State>{...s,
    enemyBullets: s.enemyBullets.concat([createBulletFromEnemy(s, Math.random())]),
    objCount: s.objCount + 1
  }:
  tick(s, e.elapsed);

  //Combines all the observable streams and for each observable it executes reduceState and then updateView
  const subscription = merge(keyboardMoveInput,mouseMoveInput, keyboardShootInput, tickInterval, mouseShootInput, enemyBullets).pipe(scan(reduceState, gameState)).subscribe(updateView),

  //This is called to update the bullets movement OBJECTState locally in this ts document
  bulletMove = (o:ObjectState): ObjectState => <ObjectState>
  {
    ...o,
    pos: o.pos.sub(o.vel),
  },
  //This is called to update the Enemy when the object moves down OBJECTState locally in this ts document
  enemyMoveDown = (o:ObjectState): ObjectState => <ObjectState>{
    ...o,
    pos: o.pos.add(new Vec(0,50)),
    row: o.row + 1
  },
  //This is called to update the Enemy when the object moves horizontally OBJECTState locally in this ts document
  enemyMoveSide = (o: ObjectState, side: number): ObjectState => <ObjectState>{
    ...o,
    pos: o.pos.add(new Vec(side*30, 0))
  };
  //This function returns the closest enemy row to the ship, this is to check if the enemy's are close enough to the ship to result in a gameOver
  function closestEnemy(array: ReadonlyArray<ObjectState>): number{
    let closest = 0
    array.forEach(a => a.row > closest ? closest = a.row : closest = closest)
    return closest;
  }

  //This function handles collisions for all bullets with ships and enemys
  const handleCollisions = (s:State) => {
    const
      // Some array utility functions
      not = <T>(f:(x:T)=>boolean)=>(x:T)=>!f(x),
      mergeMap = <T, U>(a: ReadonlyArray<T>,f: (a: T) => ReadonlyArray<U>) => Array.prototype.concat(...a.map(f)),

      //Objects collided checks if two general objects collide when a curried parameter is eneted
      bodiesCollided = ([a,b]:[ObjectState,ObjectState]) => a.pos.sub(b.pos).len() < a.radius + b.radius,
      //for the inputted objects, since the ship is an image, needed to tweak the radius of the ship to be acccurate to the visual shipm make sure ship is the first object inputted
      bodiesCollidedwithShip = ([ship,b]:[ObjectState,ObjectState]) => ship.pos.add(new Vec(28,43)).sub(b.pos).len() < ship.radius + b.radius,
      //Boolean statement if ship has collided with any enemybullets currently in the game
      shipCollided: boolean = s.enemyBullets.filter(r=>bodiesCollidedwithShip([s.ship,r])).length > 0,
      //Array of bullets and Enemies mapped together
      allBulletsAndEnemies: Array<ObjectState[]> = mergeMap(s.bullets, b=> s.enemies.map(r=>([b,r]))),
      //Checks if bullets and enemies have collided currently in the game
      collidedBulletsAndEnemies: Array<ObjectState[]> = allBulletsAndEnemies.filter(bodiesCollided),
      //returns an array of just the bullets that collided
      collidedBullets: ObjectState[] = collidedBulletsAndEnemies.map(([bullet,_])=>bullet),
      //returns an array of just the enemies that collided
      collidedEnemies: ObjectState[] = collidedBulletsAndEnemies.map(([_,enemy])=>enemy),
        
      // search for a body by id in an array
      elem = (a:ReadonlyArray<ObjectState>) => (e:ObjectState): boolean=> a.findIndex(b=>b.id === e.id) >= 0,
      // array a except anything in b
      except = (a:ReadonlyArray<ObjectState>) => (b:ObjectState[]): ReadonlyArray<ObjectState> => a.filter(not(elem(b)))
    
    //Returns a state with all the collided Bullets and Enemies removed in the respective arrays, if ship was hit or if enemies are too close Gameover will be changed
    return <State>{
      ...s,
      bullets: except(s.bullets)(collidedBullets),
      enemies: except(s.enemies)(collidedEnemies),
      score: s.score + collidedBulletsAndEnemies.length,
      exit: s.exit.concat(collidedBullets,collidedEnemies),
      objCount: s.objCount,
      gameOver: closestEnemy(s.enemies) === s.ship.row || shipCollided
    }
  }
  //alternations between the enemy moving down or to the side
  const downOrSide = new AltenateDirection(1),
  //alternated between left or right side movement
  direction= new AltenateDirection(1),

  //This tick returns the state, but filtered all the bullets to be gone and updates all values given their velocity
  tick = (s:State,elapsed:number): State => {
    const not = <T>(f:(x:T)=>boolean)=>(x:T)=>!f(x),
      expired = (b:ObjectState)=>(elapsed - b.createTime) > CONSTANTS.BULLET_EXPIRIATION_TIME,
      enemyExpired = (b:ObjectState)=>(elapsed - b.createTime) > CONSTANTS.BULLET_EXPIRIATION_TIME + 140,
      expiredBullets:ObjectState[] = s.bullets.filter(expired),
      activeBullets = s.bullets.filter(not(expired)),
      expiredEnemyBullets:ObjectState[] = s.enemyBullets.filter(enemyExpired),
      activeEnemyBullets = s.enemyBullets.filter(not(enemyExpired));
      return handleCollisions({...s,
      bullets:activeBullets.map(bulletMove), 
      enemies: elapsed%100==0 ? downOrSide.nextValue() == 1 ? s.enemies.map(enemyMoveDown) : direction.nextValue() == 1 ? s.enemies.map(enemy => enemyMoveSide(enemy, 1)) : s.enemies.map(enemy => enemyMoveSide(enemy, -1)) : s.enemies, 
      enemyBullets: activeEnemyBullets.map(bulletMove),
      exit:expiredBullets,
      time:elapsed
      })
    }    

  //This function takes in a state and updates the values in state object to the html file
  function updateView(object: State): void{
    //Creates text, to reduce repetitive code
    const createText = (text: string, cssClass: string, x: number, y: number): Element=>
      {const v = document.createElementNS(svg.namespaceURI, "text")!
      v.setAttribute("id", text)
      v.setAttribute("x", String(x))
      v.setAttribute("y", String(y))
      v.setAttribute("class", cssClass)
      v.textContent = text
      svg.appendChild(v)
      return v;
    }
  

    //We put an exclamation mark to make sure that ship is not null ship is just the element pulled from the html file with id"ship"
    const ship = document.getElementById("ship")!;
    //svg is an element with id"canvas" in the html file
    const svg  = document.getElementById("canvas")!;
    //scoreNo is an element with id"score-no" which is the score attribute in the game
    const scoreNo = document.getElementById("score-no")!;
    ship.setAttribute('transform', `translate(${object.ship.pos.x}, ${object.ship.pos.y})`)
    scoreNo.textContent = String(object.score)

    //For each bullets (bullets from ship and bullets from enemy), create a new bullet with the appropriate x and y from their objectstate if the bullet is already created it overwrites it because of the same bullet id
    const bullets: Array<ReadonlyArray<ObjectState>> = [object.bullets,object.enemyBullets]
    bullets.forEach(bullet => bullet.forEach(b=>{
      const createBodyView = ()=>{
        const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
        v.setAttribute("id",b.id);
        v.classList.add("bullet")
        svg.appendChild(v)
        return v;
      }
      const v = document.getElementById(b.id) || createBodyView();
      v.setAttribute("cx",String(b.pos.x))
      v.setAttribute("cy",String(b.pos.y))
      v.setAttribute("rx", String(b.radius));
      v.setAttribute("ry", String(b.radius));
    }))
    //For each enemy is either created or replaced with a new element 'v' which has it's updated positioning
    object.enemies.forEach(b => {
      const createBodyView = ()=> {
      const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
        v.setAttribute("id", b.id)
        v.classList.add("enemy")
        svg.appendChild(v)
        return v;
    }
    const v = document.getElementById(b.id) || createBodyView();
    v.setAttribute("cx", String(b.pos.x))
    v.setAttribute("cy",String(b.pos.y))
    v.setAttribute("rx", String(b.radius))
    v.setAttribute("ry", String(b.radius))
    })
    //For each object that is supposed to be removed is deleted from the svg 
    object.exit.forEach(o=>{
      const v = document.getElementById(o.id);
      if(v) svg.removeChild(v)
    })
    object.exit.map(o=>document.getElementById(o.id))
    .filter(isNotNullOrUndefined)
    .forEach(v=>{
      try {
        svg.removeChild(v)
      } catch(e) {
        // rarely it can happen that a bullet can be in exit 
        // for both expiring and colliding in the same tick,
        // which will cause this exception
        console.log("Already removed: "+v.id)
      }
    })
    function clearGame(Object: State){
    [object.enemies, object.bullets, object.enemyBullets].forEach(object => object.forEach(o=>{
        const v = document.getElementById(o.id);
        if(v) svg.removeChild(v)
      }))
    }
    //If all enemies are destroyed, then move to the next level. There is a countdown on the html document visually, this is done with setTimeout
    if (object.enemies.length == 0){
      subscription.unsubscribe();
      clearGame(object)
      //Text to end game
      const endText = createText("Level Completed!, Next Level In...", "nextLevelText", CONSTANTS.CANVAS_SIZE/10, CONSTANTS.CANVAS_SIZE/3)
      const num = createText("3", "nextLevelNumber", CONSTANTS.CANVAS_SIZE/2 - 40, CONSTANTS.CANVAS_SIZE/2 + 30)
      setTimeout(() => {
        num.textContent = "2"
      }, 1000);
      setTimeout(() => {
        num.textContent = "1"
      }, 2000);
      setTimeout(() => {
        num.textContent = "0"
      }, 3000);
      setTimeout(() => {
        //Remove text on screen
        svg.removeChild(endText)
        svg.removeChild(num)
        const levelno = document.getElementById("level-no")!;
        levelno.textContent = String(Number(levelno.textContent) + 1)
        //Call to next level
        play(level + 1, object)        
      }, 4000);
      
    }
    //If the game is over then stop observable streams created and end game with game over text
    if(object.gameOver) {
      //Stop actual game and put game over text on screen
      subscription.unsubscribe();
      clearGame(object)
      const gameOverText = createText("Game Over","gameOver",CONSTANTS.CANVAS_SIZE/8,CONSTANTS.CANVAS_SIZE/2),
      retryText = createText("Click to Try Again","nextLevelText",CONSTANTS.CANVAS_SIZE/3.8,CONSTANTS.CANVAS_SIZE/1.5),
      mouseClickInput = fromEvent<MouseEvent>(document,"mousedown").pipe(filter(({x,y}) => mouseInSVG(x,y))).subscribe(e => retryClick(svg));
    
      function retryClick(svg: HTMLElement): void {
        //Remove game over text on screen and unwanted objects
        svg.removeChild(gameOverText)
        svg.removeChild(retryText)
        object.enemyBullets.forEach(o=>{
          const v = document.getElementById(o.id);
          if(v) svg.removeChild(v)
        })
        mouseClickInput.unsubscribe()

        //Call to restart game
        play(0)
      }
    }
  }
  }
          


        
      }


  //Function shows the controlkeys
  function showKeys() {
    type KeyAllowed = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp'
    function showKey(k:KeyAllowed) {
      const arrowKey = document.getElementById(k)!,
        o = (e:string) => fromEvent<KeyboardEvent>(document,e).pipe(
          filter(({code})=>code === k))
      o('keydown').subscribe(_ => arrowKey.classList.add("pressed"))
      o('keyup').subscribe(_=>arrowKey.classList.remove("pressed"))
    }
    showKey('ArrowLeft');
    showKey('ArrowRight');
    showKey('ArrowUp');
    }
  
    //Class represents mathematical vectors
    class Vec {
      constructor(public readonly x: number = 0, public readonly y: number = 0) {}
      add = (b:Vec) => new Vec(this.x + b.x, this.y + b.y)
      sub = (b:Vec) => this.add(b.scale(-1))
      len = ()=> Math.sqrt(this.x*this.x + this.y*this.y)
      scale = (s:number) => new Vec(this.x*s,this.y*s)
      ortho = ()=> new Vec(this.y,-this.x)
      rotate = (deg:number) =>
                (rad =>(
                    (cos,sin,{x,y})=>new Vec(x*cos - y*sin, x*sin + y*cos)
                  )(Math.cos(rad), Math.sin(rad), this)
                )(Math.PI * deg / 180)
    
      static unitVecInDirection = (deg: number) => new Vec(0,-1).rotate(deg)
      static Zero = new Vec();
    }
    //Returns if the input is not null or undefined
    function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
      return input != null;
    }


    

  
  // the following simply runs your the spaceinvaders and showKeys function on window load.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      showKeys();
      spaceinvaders();
    }
  
  


