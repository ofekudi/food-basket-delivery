import { Context, AndFilter, Storable, Column, getControllerDefs } from "@remult/core";
import { Families, GroupsValue } from "./families";
import { Roles } from "../auth/roles";
import { BasketTypeId, QuantityColumn } from "./BasketType";
import { DistributionCenterId, DistributionCenters, allCentersToken } from "../manage/distribution-centers";
import { HelperId, Helpers, HelpersBase } from "../helpers/helpers";

import { FamilyStatus } from "./FamilyStatus";

import { ActionOnRows, packetServerUpdateInfo } from "./familyActionsWiring";
import { DeliveryStatus } from "./DeliveryStatus";
import { ActiveFamilyDeliveries, FamilyDeliveries } from "./FamilyDeliveries";
import { use } from "../translate";
import { getLang } from '../sites/sites';
import { ServerController } from "@remult/core";
import { ValueListValueConverter } from "../../../../radweb/projects/core/src/column";
import { DataControl, getValueList } from "../../../../radweb/projects/angular";
import { Groups } from "../manage/groups";
import { FamilySources } from "./FamilySources";

@Storable({
    valueConverter: () => new ValueListValueConverter(SelfPickupStrategy),
    caption: use.language.selfPickupStrategy
})
export class SelfPickupStrategy {
    static familyDefault = new SelfPickupStrategy(0, use.language.selfPickupStrategy_familyDefault, x => {
        x.newDelivery.deliverStatus = x.family.defaultSelfPickup ? DeliveryStatus.SelfPickup : DeliveryStatus.ReadyForDelivery;
    });
    static byCurrentDelivery = new SelfPickupStrategy(1, use.language.selfpickupStrategy_byCurrentDelivery, x => {
        x.newDelivery.deliverStatus =
            x.existingDelivery.deliverStatus == DeliveryStatus.SuccessPickedUp || x.existingDelivery.deliverStatus == DeliveryStatus.SelfPickup
                ? DeliveryStatus.SelfPickup
                : DeliveryStatus.ReadyForDelivery;
    });
    static yes = new SelfPickupStrategy(2, use.language.selfPickupStrategy_yes, x => {
        x.newDelivery.deliverStatus = DeliveryStatus.SelfPickup
    });
    static no = new SelfPickupStrategy(3, use.language.selfpickupStrategy_no, x => {
        x.newDelivery.deliverStatus = DeliveryStatus.ReadyForDelivery
    });

    constructor(public id: number, public caption: string, public applyTo: (args: { existingDelivery: ActiveFamilyDeliveries, newDelivery: ActiveFamilyDeliveries, family: Families }) => void) {

    }
}


@ServerController({
    allowed: Roles.admin,
    key: 'NewDelivery'
})
export class NewDelivery extends ActionOnRows<Families> {
    @Column({ caption: use.language.useFamilyDefaultBasketType })
    useFamilyBasket: boolean = true;
    @Column()
    basketType: BasketTypeId;
    @Column({ caption: use.language.useFamilyQuantity })
    useFamilyQuantity: boolean = true;
    @Column({ caption: use.language.useFamilyMembersAsQuantity })
    useFamilyMembersAsQuantity: boolean;
    @QuantityColumn()
    quantity: number;
    @Column()
    distributionCenter: DistributionCenterId;
    @Column({ caption: use.language.defaultVolunteer })
    useDefaultVolunteer: boolean = true;
    @Column()
    courier: HelpersBase;
    @Column()
    @DataControl({ valueList: new ValueListValueConverter(SelfPickupStrategy).getOptions().filter(x => x != SelfPickupStrategy.byCurrentDelivery) })
    selfPickup: SelfPickupStrategy;
    @Column({
        caption: use.language.excludeGroups
    })
    get $() { return getControllerDefs(this).columns };
    excludeGroups: GroupsValue;
    constructor(context: Context) {
        super(context, Families, {
            validate: async () => {
                let x = await this.distributionCenter.waitLoad();
                if (this.distributionCenter.exists()) {
                    this.$.distributionCenter.error = getLang(this.context).mustSelectDistributionList;
                    throw this.$.distributionCenter.error;
                }
            },
            dialogColumns: async (component) => {
                this.basketType = new BasketTypeId('', context);
                this.quantity = 1;
                this.distributionCenter = component.dialog.distCenter;
                if (this.distributionCenter.isAllCentersToken())
                    this.distributionCenter = new DistributionCenterId('', context);
                return [
                    this.$.useFamilyBasket,
                    { column: this.$.basketType, visible: () => !this.useFamilyBasket },
                    this.$.useFamilyQuantity,
                    { column: this.$.useFamilyMembersAsQuantity, visible: () => !this.useFamilyQuantity },
                    { column: this.$.quantity, visible: () => !this.useFamilyQuantity && !this.useFamilyMembersAsQuantity },
                    { column: this.$.distributionCenter, visible: () => component.dialog.hasManyCenters },
                    this.$.useDefaultVolunteer,
                    { column: this.$.courier, visible: () => !this.useDefaultVolunteer },
                    {
                        column: this.$.selfPickup,
                        visible: () => component.settings.usingSelfPickupModule
                    },
                    this.$.excludeGroups
                ]
            },
            additionalWhere: f => f.status.isEqualTo(FamilyStatus.Active),


            title: getLang(context).newDelivery,
            icon: 'add_shopping_cart',
            forEach: async f => {

                for (let g of this.excludeGroups.listGroups()) {
                    if (f.groups.selected(g.trim())) {
                        return;
                    }

                }

                let fd = f.createDelivery(this.distributionCenter.evilGetId());
                fd._disableMessageToUsers = true;
                if (!this.useFamilyBasket) {
                    fd.basketType = this.basketType;
                }
                if (!this.useFamilyQuantity) {
                    if (this.useFamilyMembersAsQuantity)
                        fd.quantity = f.familyMembers;
                    else
                        fd.quantity = this.quantity;
                }
                this.selfPickup.applyTo({ existingDelivery: undefined, newDelivery: fd, family: f });
                if (!this.useDefaultVolunteer) {
                    fd.courier = this.courier;
                }
                let count = (await fd.duplicateCount());
                if (count == 0)
                    await fd.save();
            },
            onEnd: async () => {

            }
        });
    }
}
@Storable({
    caption: use.language.action,
    valueConverter: () => new ValueListValueConverter(UpdateGroupStrategy)
})
export class UpdateGroupStrategy {
    static add = new UpdateGroupStrategy(0, use.language.addGroupAssignmentVerb, (col, val) => {
        if (!col.selected(val))
            col.addGroup(val);
    });
    static remove = new UpdateGroupStrategy(1, use.language.removeGroupAssignmentVerb, (col, val) => {
        if (col.selected(val))
            col.removeGroup(val);
    });
    static replace = new UpdateGroupStrategy(2, use.language.replaceGroupAssignmentVerb, (col, val) => {
        col.replace(val);
    });

    constructor(public id: number, public caption: string, public whatToDo: (col: GroupsValue, val: string) => void) {

    }
}

@ServerController({
    allowed: Roles.admin,
    key: 'updateGroup'
})
export class updateGroup extends ActionOnRows<Families> {

    @Column({
        caption: use.language.familyGroup

    })
    @DataControl({
        valueList: context => getValueList<Groups>(context.for(Groups), { idColumn: x => x.columns.name, captionColumn: x => x.columns.name })
    })
    group: string;
    @Column()
    action: UpdateGroupStrategy;
    get $() { return getControllerDefs(this).columns }
    constructor(context: Context) {
        super(context, Families, {
            confirmQuestion: () => this.action.caption + ' "' + this.group + '"',
            title: getLang(context).assignAFamilyGroup,
            forEach: async f => {
                this.action.whatToDo(f.groups, this.group);
            }

        });
        this.group = '';
    }
}




@ServerController({
    allowed: Roles.admin,
    key: 'UpdateFamilyStatus'
})
export class UpdateStatus extends ActionOnRows<Families> {
    @Column()
    status: FamilyStatus = FamilyStatus.Active;
    @Column({ caption: use.language.archiveFinishedDeliveries })
    archiveFinshedDeliveries: boolean = true;
    @Column({ caption: use.language.deletePendingDeliveries })
    deletePendingDeliveries: boolean = true;
    @Column({ caption: use.language.internalComment })
    comment: string;
    @Column({ caption: use.language.deleteExistingComment })
    deleteExistingComment: boolean;

    get $() { return getControllerDefs(this).columns };
    constructor(context: Context) {
        super(context, Families, {
            help: () => getLang(this.context).updateStatusHelp,
            dialogColumns: async () => {
                if (!this.status)
                    this.status = FamilyStatus.Active;

                return [
                    this.$.status,
                    this.$.comment,
                    this.$.deleteExistingComment,
                    { column: this.$.archiveFinshedDeliveries, visible: () => this.status != FamilyStatus.Active },
                    { column: this.$.deletePendingDeliveries, visible: () => this.status != FamilyStatus.Active },

                ]
            },
            title: getLang(context).updateFamilyStatus,
            forEach: async f => {
                f.status = this.status;
                if (this.deleteExistingComment) {
                    f.internalComment = '';
                }
                if (this.comment) {
                    if (f.internalComment)
                        f.internalComment += ", ";
                    f.internalComment += this.comment;
                }
                if (f.status != FamilyStatus.Active && (this.archiveFinshedDeliveries || this.deletePendingDeliveries)) {
                    for await (const fd of this.context.for(ActiveFamilyDeliveries).iterate({ where: fd => fd.family.isEqualTo(f.id) })) {
                        if (fd.deliverStatus.IsAResultStatus()) {
                            if (this.archiveFinshedDeliveries) {
                                fd.archive = true;
                                await fd.save();
                            }
                        }
                        else {
                            if (this.deletePendingDeliveries)
                                await fd.delete();
                        }

                    }
                }
            }
        });
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'UpdateFamilyBasketType'
})
export class UpdateBasketType extends ActionOnRows<Families> {
    @Column()
    basket: BasketTypeId;

    constructor(context: Context) {
        super(context, Families, {
            title: getLang(context).updateDefaultBasket,
            forEach: async f => { f.basketType = this.basket },
        });
    }
}

@ServerController({
    allowed: Roles.admin,
    key: 'UpdateSelfPickup'
})
export class UpdateSelfPickup extends ActionOnRows<Families> {
    @Column({ caption: use.language.selfPickup })
    selfPickup: boolean;
    @Column({ caption: use.language.updateExistingDeliveries })
    updateExistingDeliveries: boolean;


    constructor(context: Context) {
        super(context, Families, {
            visible: c => c.settings.usingSelfPickupModule,
            title: getLang(context).updateDefaultSelfPickup,
            forEach: async f => {
                {
                    f.defaultSelfPickup = this.selfPickup;
                    if (this.updateExistingDeliveries) {
                        for await (const fd of this.context.for(ActiveFamilyDeliveries).iterate({ where: fd => fd.family.isEqualTo(f.id).and(DeliveryStatus.isNotAResultStatus(fd.deliverStatus)) })) {
                            if (this.selfPickup) {
                                if (fd.deliverStatus == DeliveryStatus.ReadyForDelivery)
                                    fd.deliverStatus = DeliveryStatus.SelfPickup;

                            }
                            else
                                if (fd.deliverStatus == DeliveryStatus.SelfPickup)
                                    fd.deliverStatus = DeliveryStatus.ReadyForDelivery;
                            if (fd.wasChanged())
                                await fd.save();
                        }
                    }
                }
            },
        });
        this.updateExistingDeliveries = true;
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'UpdateArea'
})
export class UpdateArea extends ActionOnRows<Families> {
    @Column({ caption: use.language.region })
    area: string;

    constructor(context: Context) {
        super(context, Families, {
            title: getLang(context).updateArea,
            forEach: async f => { f.area = this.area.trim() },
        });
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'UpdateDefaultQuantity'
})
export class UpdateQuantity extends ActionOnRows<Families> {
    @QuantityColumn()
    quantity: number;

    constructor(context: Context) {
        super(context, Families, {
            title: getLang(context).updateDefaultQuantity,
            forEach: async f => { f.quantity = this.quantity },
        });
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'UpdateFamilySource'
})
export class UpdateFamilySource extends ActionOnRows<Families> {
    @Column()
    familySource: FamilySources;

    constructor(context: Context) {
        super(context, Families, {
            title: getLang(context).updateFamilySource,
            forEach: async f => { f.familySource = this.familySource }
        });
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'UpdateDefaultVolunteer'
})
export class UpdateDefaultVolunteer extends ActionOnRows<Families> {
    @Column({ caption: use.language.clearVolunteer })
    clearVoulenteer: boolean;
    @Column()
    courier: HelpersBase;
    get $() { return getControllerDefs(this).columns };
    constructor(context: Context) {
        super(context, Families, {
            dialogColumns: async () => [
                this.$.clearVoulenteer,
                { column: this.$.courier, visible: () => !this.clearVoulenteer }
            ],

            title: getLang(context).updateDefaultVolunteer,
            forEach: async fd => {
                if (this.clearVoulenteer) {
                    fd.fixedCourier = null;
                }
                else {
                    fd.fixedCourier = this.courier;
                }
            },

        });
        this.courier = null;
    }
}




export abstract class bridgeFamilyDeliveriesToFamilies extends ActionOnRows<ActiveFamilyDeliveries>{
    processedFamilies = new Map<string, boolean>();
    __columns = getControllerDefs(this.orig);

    constructor(context: Context, public orig: ActionOnRows<Families>) {
        super(context, ActiveFamilyDeliveries, {
            forEach: async fd => {
                if (this.processedFamilies.get(fd.family))
                    return;
                this.processedFamilies.set(fd.family, true);
                let f = await context.for(Families).findFirst(x => new AndFilter(orig.args.additionalWhere(x), x.id.isEqualTo(fd.family)))
                if (f) {
                    await orig.args.forEach(f);
                    await f.save();
                }
            },
            title: orig.args.title,
            confirmQuestion: orig.args.confirmQuestion,
            dialogColumns: x => orig.args.dialogColumns({
                afterAction: x.afterAction,
                userWhere: () => { throw 'err' },
                dialog: x.dialog,
                settings: x.settings
            }),
            help: orig.args.help,
            onEnd: orig.args.onEnd,
            validate: orig.args.validate,
            additionalWhere: undefined,
            validateInComponent: x => orig.args.validateInComponent({
                afterAction: x.afterAction,
                userWhere: () => { throw 'err' },
                dialog: x.dialog,
                settings: x.settings
            })
        });
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'updateGroupForDeliveries'
})
export class updateGroupForDeliveries extends bridgeFamilyDeliveriesToFamilies {
    constructor(context: Context) {
        super(context, new updateGroup(context))
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'UpdateAreaForDeliveries'
})
export class UpdateAreaForDeliveries extends bridgeFamilyDeliveriesToFamilies {
    constructor(context: Context) {
        super(context, new UpdateArea(context))
    }
}
@ServerController({
    allowed: Roles.admin,
    key: 'UpdateStatusForDeliveries'
})
export class UpdateStatusForDeliveries extends bridgeFamilyDeliveriesToFamilies {
    constructor(context: Context) {
        super(context, new UpdateStatus(context))
    }
}

