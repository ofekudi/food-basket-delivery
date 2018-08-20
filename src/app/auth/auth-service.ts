import { Injectable } from "@angular/core";
import { Authentication } from "./authentication";
import { myAuthInfo } from "./my-auth-info";
import { foreachEntityItem } from "../shared/utils";

import { SelectService } from "../select-popup/select-service";
import { Router, Route } from "@angular/router";
import { evilStatics } from "./evil-statics";
import { LoginFromSmsAction } from "../login-from-sms/login-from-sms-action";
import { Helpers } from "../helpers/helpers";
import * as passwordHash from 'password-hash';
import { RunOnServer } from "./server-action";


@Injectable()
export class AuthService {

    async loginFromSms(key: string) {
        this.auth.loggedIn(await new LoginFromSmsAction().run({ key: key }), false);
        if (this.auth.valid) {
            this.router.navigate([evilStatics.routes.myFamilies]);
        }
    }
    constructor(
        private dialog: SelectService,
        private router: Router
    ) { }

    async login(user: string, password: string, remember: boolean, fail: () => void) {

        let loginResponse = await AuthService.login(user,password);
        this.auth.loggedIn(loginResponse, remember);
        if (this.auth.valid) {
            if (loginResponse.requirePassword) {
                this.dialog.YesNoQuestion('שלום ' + this.auth.info.name + ' את מוגדרת כמנהלת אך לא מוגדרת עבורך סיסמה. כדי להשתמש ביכולות הניהול חובה להגן על הפרטים עם סיסמה. הנך מועברת למסך עדכון פרטים לעדכון סיסמה.', () => {
                    this.router.navigate([evilStatics.routes.updateInfo])
                });
            }
            else {
                if (this.auth.info.admin)
                    this.router.navigate([evilStatics.routes.families])
                else
                    this.router.navigate([evilStatics.routes.myFamilies])
            }

        }
        else {
            this.dialog.Error("משתמשת לא נמצאה או סיסמה שגויה");
            fail();
        }
    }
    @RunOnServer
    static async login(user: string, password: string) {
        let result: myAuthInfo;
        let requirePassword = false;
        await foreachEntityItem(new Helpers(), h => h.phone.isEqualTo(user), async h => {
            if (!h.realStoredPassword.value || passwordHash.verify(password, h.realStoredPassword.value)) {
                result = {
                    helperId: h.id.value,
                    admin: h.isAdmin.value,
                    name: h.name.value
                };
                if (result.admin && h.realStoredPassword.value.length == 0) {
                    result.admin = false;
                    requirePassword = true;
                }
            }
        });
        if (result) {
            return {
                valid: true,
                authToken: evilStatics.auth.createTokenFor(result),
                requirePassword
            };
        }
        return { valid: false, requirePassword: false };
    }
    signout(): any {
        this.auth.signout();
        this.router.navigate([evilStatics.routes.login]);
    }
    auth = evilStatics.auth;

}