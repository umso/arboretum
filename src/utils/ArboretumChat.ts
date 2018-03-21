import {SDB, SDBDoc} from './ShareDBDoc';
import {TypedEventEmitter} from './TypedEventEmitter';
import {guid, guidIndex} from './guid';
import * as _ from 'underscore';
import {BrowserState} from '../server/state/BrowserState';

export type Color = string;
export const userColors:Array<Array<Color>> = [
    ['#A80000', '#B05E0D', '#C19C00', '#107C10', '#038387', '#004E8C', '#5C126B' ]
];
export enum TypingStatus { IDLE, ACTIVE, IDLE_TYPED };
export enum PageActionState { NOT_PERFORMED, PERFORMED, REJECTED };
export type PageAction ='navigate'|'goBack'|'goForward'|'mouse_event'|'keyboard_event'|'element_event'|'focus_event'|'reload'|'getLabel';

export type UserID = string;
export interface User {
    id:UserID,
    displayName:string,
    present:boolean,
    typing:TypingStatus,
    color:Color
};
export interface Message {
    sender:User,
    timestamp?:number,
    id?:number,
};
export interface TextMessage extends Message {
    content:string
};
export interface PageActionMessage extends Message {
    action:PageAction,
    tabID:CRI.TabID,
    data:any,
    state:PageActionState,
    nodeDescriptions:{[id:number]:string;}
};

export interface ChatDoc {
    users:Array<User>,
    messages:Array<Message>,
    colors:Array<Color>
};

export interface UserJoinedEvent {
    user:User,
    after?:User
};
export interface UserNotPresentEvent {
    user:User
};
export interface UserTypingStatusChangedEvent {
    user:User,
    typing:TypingStatus
};
export interface MessageAddedEvent {
    message:Message,
    after?:Message
};
export interface ReadyEvent { };
export interface PAMStateChanged { };

export class ArboretumChat extends TypedEventEmitter {
    private static userCounter:number = 1;
    private static messageCounter:number = 1;
    private doc:SDBDoc<ChatDoc>;
    public initialized:Promise<void>;
    private meUser:User;
    public userJoined = this.registerEvent<UserJoinedEvent>();
    public userNotPresent = this.registerEvent<UserNotPresentEvent>();
    public userTypingStatusChanged = this.registerEvent<UserTypingStatusChangedEvent>();
    public messageAdded = this.registerEvent<MessageAddedEvent>();
    public pamStateChanged = this.registerEvent<PAMStateChanged>();
    public ready = this.registerEvent<ReadyEvent>();
    constructor(private sdb:SDB, private browserState?:BrowserState) {
        super();
        this.doc = this.sdb.get<ChatDoc>('arboretum', 'chat');
        this.initialized = this.initializeDoc();
        this.initialized.catch((err) => {
            console.error(err);
        });
    };
    public static describePageActionMessage(pam:PageActionMessage):string {
        const {action, data, state} = pam;
        if(action === 'navigate') {
            const {url} = data;
            return `navigate to ${url}`;
        } else if(action === 'mouse_event') {
            const {targetNodeID, type} = data;
            const nodeDescriptions = data.nodeDescriptions || {};
            const nodeDescription:string = nodeDescriptions[targetNodeID] || `element ${targetNodeID}`;
            return `${type} ${nodeDescription}`;
        } else {
            return `do ${action}`;
        }
    };
    public static getRelevantNodeIDs(pam:PageActionMessage):Array<CRI.NodeID> {
        const {action, data, state} = pam;
        const {targetNodeID} = data;
        if(targetNodeID) {
            return [targetNodeID];
        } else {
            return [];
        }
    };
    private async initializeDoc():Promise<void> {
        await this.doc.createIfEmpty({
            users: [],
            messages: [],
            colors: _.shuffle(_.sample(userColors))
        });
        this.doc.subscribe((ops, source, data) => {
            if(ops) {
                ops.forEach((op) => this.handleOp(op));
            } else {
                this.ready.emit();
            }
        });
    };
    private handleOp(op) {
        const {p} = op;
        if(p[0] === 'users') {
            const {li} = op;
            if(p.length === 2 && li) { // user added
                this.userJoined.emit({
                    user:li
                });
            } else if(p.length === 3 && p[2] === 'present') { // presence status changed
                const userIndex = p[1];
                const {oi, od} = op;
                const user = this.doc.getData().users[userIndex];
                if(oi === false) {
                    this.userNotPresent.emit({ user });
                }
            }
        } else if(p[0] === 'messages') {
            const {li} = op;
            if(li.action && li.data && this.browserState) {
                const relevantNodeIDs:Array<CRI.NodeID> = ArboretumChat.getRelevantNodeIDs(li as PageActionMessage);
                const relevantNodes = relevantNodeIDs.map((id) => this.browserState.getNode(id));
            }
            this.messageAdded.emit({
                message:li
            });
        }
    };
    public getMe():User {
        return this.meUser;
    };
    private async getColor(id:UserID):Promise<Color> {
        await this.initialized;
        const data:ChatDoc = this.doc.getData();
        const {colors} = data;
        const index = guidIndex(id) % colors.length;
        return colors[index];
    };
    public async join(displayName:string):Promise<User> {
        return this.addUser(displayName);
    };
    public async addUser(displayName:string, isMe:boolean=true, present=true):Promise<User> {
        const id:UserID = guid();
        const color:Color = await this.getColor(id);
        const user:User = {id, color, displayName, present, typing:TypingStatus.IDLE};
        await this.initialized;

        await this.doc.submitListPushOp(['users'], user);
        if(isMe) { this.meUser = user; }
        return user;
    };
    private async addMesssage(message:Message) {
        await this.initialized;
        const timestamp:number = (new Date()).getTime()
        message.timestamp = (new Date()).getTime();
        message.id = ArboretumChat.messageCounter++;
        this.doc.submitListPushOp(['messages'], message);
    };
    public async addTextMessage(content:string, sender:User=this.getMe()):Promise<void> {
        const message:TextMessage = {sender, content};
        this.addMesssage(message);
    };
    public async addPageActionMessage(action:PageAction, tabID:CRI.TabID, data:any={}, sender:User=this.getMe()):Promise<void> {
        const nodeDescriptions = data.nodeDescriptions || {};
        const message:PageActionMessage = {sender, action, tabID, data, nodeDescriptions, state:PageActionState.NOT_PERFORMED}
        this.addMesssage(message);
    };
    public async setState(pam:PageActionMessage, state:PageActionState):Promise<void> {
        const messages = await this.getMessages();
        const {id} = pam;
        for(let i = 0; i<messages.length; i++) {
            const message:Message = messages[i];
            if(message.id === id) {
                this.doc.submitObjectReplaceOp(['messages', i, 'state'], state);
                this.pamStateChanged.emit({});
                break;
            }
        }
    };
    private async getUserIndex(user:User):Promise<number> {
        await this.initialized;
        const data:ChatDoc = this.doc.getData();
        for(let i = 0; i<data.users.length; i++) {
            const u = data.users[i];
            if(user.id === u.id) {
                return i;
            }
        }
        return -1;
    };
    public async markUserNotPresent(user:User):Promise<void> {
        await this.initialized;
        const data:ChatDoc = this.doc.getData();
        const userIndex:number = await this.getUserIndex(user);
        await this.doc.submitObjectReplaceOp(['users', userIndex, 'present'], false);
        // await this.doc.submitObjectDeleteOp(['users', userIndex, 'present']);
    };
    public async leave():Promise<void> {
        await this.markUserNotPresent(this.getMe());
    };
    public async setUserTypingStatus(user:User, typingStatus:TypingStatus):Promise<void> {
        await this.initialized;
        const data:ChatDoc = this.doc.getData();
        const userIndex:number = await this.getUserIndex(user);
        await this.doc.submitObjectReplaceOp(['users', userIndex, 'typing'], typingStatus);
    };
    public async getMessages():Promise<Array<Message>> {
        await this.initialized;
        const data:ChatDoc = this.doc.getData();
        return data.messages;
    };
    public async getUsers(onlyPresent:boolean = true):Promise<Array<User>> {
        await this.initialized;
        const data:ChatDoc = this.doc.getData();
        const {users} = data;
        if(onlyPresent) {
            return users.filter((u) => u.present);
        } else {
            return users;
        }
    };
};
